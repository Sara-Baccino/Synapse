"""
synapse_reporting.report_manager
-------------------------------------

Compiles an AnalysisResult into a complete PDF report: metadata header,
metrics table, one section per stored table (previewed, truncated with
an explicit note beyond a row threshold), figures (PNG embedded as
raster images, SVG converted to vector drawings via svglib), and a
warnings/errors log section. Works identically regardless of which
module produced the AnalysisResult.
"""

from __future__ import annotations

import io
from pathlib import Path

import polars as pl
from lxml import etree
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from svglib.svglib import SvgRenderer

from synapse_core.exceptions import synapseError
from synapse_core.models.analysis_result import (
    AnalysisResult,
    Figure,
    FigureFormat,
    LogLevel,
)

__all__ = ["ReportManager", "ReportGenerationError"]

_DEFAULT_MAX_TABLE_ROWS = 30


class ReportGenerationError(synapseError):
    """Raised when compiling an AnalysisResult into a PDF report fails."""


class ReportManager:
    """Stateless utility for compiling an AnalysisResult into a PDF report."""

    @staticmethod
    def generate_pdf(
        result: AnalysisResult,
        output_path: str | Path,
        *,
        max_table_rows: int = _DEFAULT_MAX_TABLE_ROWS,
        title: str | None = None,
    ) -> Path:
        """Compile `result` into a PDF report written to `output_path`.

        :param result: the AnalysisResult to report on (any module).
        :param output_path: destination .pdf file path.
        :param max_table_rows: tables longer than this are previewed and
            truncated with an explicit note, rather than dumped in full.
        :param title: report title; defaults to "<module_name> Report".
        :raises ReportGenerationError: if the PDF cannot be built/written.
        """
        target = Path(output_path)
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            styles = getSampleStyleSheet()
            story = []

            report_title = title or f"{result.metadata.module_name} Report"
            story.extend(ReportManager._build_header(result, report_title, styles))
            story.extend(ReportManager._build_metrics_section(result, styles))
            story.extend(ReportManager._build_tables_section(result, styles, max_table_rows))
            story.extend(ReportManager._build_figures_section(result, styles))
            story.extend(ReportManager._build_logs_section(result, styles))

            doc = SimpleDocTemplate(str(target), pagesize=A4, title=report_title)
            doc.build(story)
            return target
        except Exception as exc:  # noqa: BLE001 - normalize any reportlab/svglib failure
            raise ReportGenerationError(f"Failed to generate PDF report at '{target}': {exc}") from exc

    # ------------------------------------------------------------------ #
    # Section builders
    # ------------------------------------------------------------------ #
    @staticmethod
    def _build_header(result: AnalysisResult, title: str, styles) -> list:
        metadata = result.metadata
        elements = []

        # 1. Definizione Titolo Principale secondo il nuovo formato
        # Priorità: titolo passato esplicitamente > custom_title da report_options > formato default "Synapse - <Modulo> Analysis Report"
        custom_title = result.report_options.get("custom_title")
        if title and title != f"{metadata.module_name} Report":
            report_title = title
        elif custom_title:
            report_title = custom_title
        else:
            formatted_module_name = metadata.module_name.replace("_", " ").title()
            report_title = f"Synapse - {formatted_module_name} Analysis Report"

        # Stile Titolo Principale
        title_style = ParagraphStyle("HeaderTitle",
            parent=styles["Title"], fontName="Helvetica-Bold", fontSize=18, leading=22,
            textColor=colors.HexColor("#1A2B4C"), # Blu scuro
            alignment=0, # Allineamento a sinistra
            spaceAfter=12,
        )
        elements.append(Paragraph(report_title, title_style))

        # 2. Tabella Metadati Intestazione (Disposta su 2 colonne a tutta larghezza)
        created_at_str = metadata.created_at.strftime("%Y-%m-%d %H:%M:%S UTC")
        
        meta_left = [
            f"<b>Module:</b> {metadata.module_name}" + (f" (v{metadata.module_version})" if metadata.module_version else ""),
            f"<b>Dataset:</b> {metadata.dataset_name or 'N/A'}",
        ]
        meta_right = [
            f"<b>Created at:</b> {created_at_str}",
        ]
        if result.runtime_seconds is not None:
            meta_right.append(f"<b>Runtime:</b> {result.runtime_seconds:.2f}s")

        meta_text_left = "<br/>".join(meta_left)
        meta_text_right = "<br/>".join(meta_right)

        meta_style = ParagraphStyle("HeaderMeta",
            parent=styles["Normal"], fontName="Helvetica", fontSize=9, leading=13,
            textColor=colors.HexColor("#4A5568"),
        )

        meta_table_data = [[
            Paragraph(meta_text_left, meta_style),
            Paragraph(meta_text_right, meta_style)
        ]]

        # Larghezza di 17.5 cm (corrispondente alla larghezza stampabile di un A4 con 1.75 cm di margini)
        meta_table = Table(meta_table_data, colWidths=[9.0 * cm, 8.5 * cm], hAlign="LEFT")
        meta_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
        ]))
        
        elements.append(meta_table)
        elements.append(Spacer(1, 0.2 * cm))

        # 3. Descrizione Opzionale
        if metadata.description:
            desc_style = ParagraphStyle("HeaderDescription",
                parent=styles["Normal"], fontName="Helvetica-Oblique", fontSize=9,
                textColor=colors.HexColor("#2D3748"),
                spaceBefore=4,
            )
            elements.append(Paragraph(f"<b>Description:</b> {metadata.description}", desc_style))
            elements.append(Spacer(1, 0.2 * cm))

        # 4. Banner di Errore (se la run è fallita)
        if not result.success:
            error_style = ParagraphStyle("HeaderError",
                parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=10,
                textColor=colors.HexColor("#C53030"),
                backColor=colors.HexColor("#FFF5F5"),
                borderColor=colors.HexColor("#FEB2B2"),
                borderWidth=1,
                borderPadding=6,
                spaceBefore=6,
                spaceAfter=6,
            )
            elements.append(Paragraph(f"<b>RUN FAILED:</b> {result.error}", error_style))

        # Linea separatrice orizzontale in fondo all'header
        elements.append(Spacer(1, 0.2 * cm))
        divider = Table([[""]], colWidths=[17.5 * cm])
        divider.setStyle(TableStyle([
            ("LINEABOVE", (0, 0), (-1, -1), 1, colors.HexColor("#E2E8F0")),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
        ]))
        elements.append(divider)
        elements.append(Spacer(1, 0.4 * cm))

        return elements

    @staticmethod
    def _build_metrics_section(result: AnalysisResult, styles) -> list:
        if not result.metrics:
            return []

        elements = [Paragraph("Metrics", styles["Heading2"])]
        rows = [["Metric", "Value"]] + [[name, str(value)] for name, value in result.metrics.items()]
        elements.append(ReportManager._styled_table(rows))
        elements.append(Spacer(1, 0.4 * cm))
        return elements

    @staticmethod
    def _build_tables_section(result: AnalysisResult, styles, max_table_rows: int) -> list:
        if not result.tables:
            return []

        elements = [Paragraph("Tables", styles["Heading2"])]
        for name, table in result.tables.items():
            elements.append(Paragraph(name, styles["Heading3"]))
            elements.extend(ReportManager._dataframe_to_flowables(table, max_table_rows, styles))
            elements.append(Spacer(1, 0.3 * cm))
        return elements

    @staticmethod
    def _build_figures_section(result: AnalysisResult, styles) -> list:
        if not result.figures:
            return []

        elements = [Paragraph("Figures & Charts", styles["Heading2"])]

        # Esempio per raggruppare figure consecutive in righe affiancate
        fig_flowables = []
        for name, figure in result.figures.items():
            flowable = ReportManager._figure_to_flowable(figure) # Ritorna Image o SvgRenderer
            
            # Titolo o Didascalia della figura
            caption_text = f"<b>{name}</b>: {figure.caption}" if figure.caption else name
            caption = Paragraph(caption_text, styles["CaptionStyle"])
            
            if flowable:
                fig_flowables.append([flowable, caption])

        # Inserisci nella storia alternando immagini e didascalie con Spacers
        for img, cap in fig_flowables:
            elements.append(cap)
            elements.append(Spacer(1, 0.1 * cm))
            elements.append(img)
            elements.append(Spacer(1, 0.4 * cm))

        return elements

    @staticmethod
    def _build_logs_section(result: AnalysisResult, styles) -> list:
        relevant_logs = [entry for entry in result.logs if entry.level in (LogLevel.WARNING, LogLevel.ERROR)]
        if not relevant_logs:
            return []

        elements = [PageBreak(), Paragraph("Warnings & Errors", styles["Heading2"])]
        for entry in relevant_logs:
            color = colors.red if entry.level == LogLevel.ERROR else colors.orange
            style = ParagraphStyle("LogEntry", parent=styles["Normal"], textColor=color)
            elements.append(
                Paragraph(f"[{entry.level.value.upper()}] {entry.timestamp.isoformat()}: {entry.message}", style)
            )
        return elements

    # ------------------------------------------------------------------ #
    # Rendering helpers
    # ------------------------------------------------------------------ #
    @staticmethod
    def _dataframe_to_flowables(table: pl.DataFrame, max_rows: int, styles) -> list:
        """Render a dataframe as a styled table, appending an explicit
        truncation note (with total vs shown row counts) when the table
        exceeds `max_rows`, pointing the reader to the fully exported
        dataset instead of silently cutting content.
        """
        total_rows = table.height
        truncated = total_rows > max_rows
        preview = table.head(max_rows) if truncated else table

        rows = [preview.columns] + [[str(v) for v in row] for row in preview.iter_rows()]
        flowables = [ReportManager._styled_table(rows)]

        if truncated:
            note_style = ParagraphStyle(
                "TruncationNote",
                parent=styles["Normal"],
                fontSize=8,
                textColor=colors.grey,
                spaceBefore=4,
            )
            flowables.append(
                Paragraph(
                    f"(Mostrate prime {max_rows} di {total_rows} righe. Consultare il file esportato "
                    "in datasets/ per la tabella completa.)",
                    note_style,
                )
            )

        return flowables

    @staticmethod
    def _styled_table(rows: list[list[str]], col_widths: list[float] | None = None) -> Table:
        # Se non specificato, divide equamente i 17.5 cm utili della pagina A4
        if col_widths is None and rows:
            num_cols = len(rows[0])
            col_widths = [17.5 * cm / num_cols] * num_cols

        table = Table(rows, colWidths=col_widths, hAlign="LEFT", repeatRows=1)
        table.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#A6A8AD")), # Blu istituzionale
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E0E0E0")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8F9FA")]),
            ])
        )
        return table

    @staticmethod
    def _figure_to_flowable(figure: Figure):
        if figure.format == FigureFormat.PNG:
            return Image(io.BytesIO(figure.data), width=14 * cm, height=8 * cm, kind="proportional")

        if figure.format == FigureFormat.SVG:
            svg_bytes = figure.data.encode("utf-8") if isinstance(figure.data, str) else figure.data
            svg_root = etree.fromstring(svg_bytes)
            drawing = SvgRenderer(path=None).render(svg_root)
            return drawing

        # HTML and JSON (e.g. plotly) figures have no direct vector/raster
        # rendering path in a static PDF; reported as non-embeddable above,
        # deliberately without a headless-browser screenshot dependency
        # (kaleido/playwright) to keep synapse-reporting lightweight.
        return None