import { useState, type FormEvent, useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { GradientLogo } from "../components/branding/GradientLogo";
import { AppBackground } from "../components/branding/AppBackground";
//import { GRADIENT_BUTTON } from "../constants/brandStyles";

interface LocationState {
  from?: { pathname: string };
}

export function LandingPage() {
  const { isAuthenticated, isInitializing, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Gestione dello scroll intelligente al ritorno sulla pagina
  useEffect(() => {
    if (location.hash) {
      const targetId = location.hash.replace("#", "");
      const elem = document.getElementById(targetId);
      if (elem) {
        elem.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }

    const savedSection = sessionStorage.getItem("landing_last_section");
    if (savedSection) {
      const elem = document.getElementById(savedSection);
      if (elem) {
        setTimeout(() => {
          elem.scrollIntoView({ behavior: "auto", block: "start" });
        }, 50);
        return;
      }
    }

    window.scrollTo(0, 0);
  }, [location]);

  if (isInitializing) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  const state = location.state as LocationState | null;
  if (isAuthenticated && state?.from) {
    return <Navigate to={state.from.pathname} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(username, password);
      const state = location.state as LocationState | null;
      navigate(state?.from?.pathname ?? "/workspace", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Incorrect username or password.");
      } else {
        setError("Login failed. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const scrollToSection = (id: string) => {
    sessionStorage.setItem("landing_last_section", id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const navigateToModule = (path: string, sectionId = "modules") => {
    sessionStorage.setItem("landing_last_section", sectionId);
    navigate(path);
  };

  return (
    <div className="relative min-h-screen w-full text-slate-800 font-['Manrope',sans-serif] selection:bg-pink-200 selection:text-blue-700">
      {/* Import dei font e stili per l'animazione della Data Wave */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap"
      />
      <style>{`
        @keyframes waveMotionSlow {
          0% { transform: translateY(0px) scaleY(1); }
          50% { transform: translateY(-15px) scaleY(1.03); }
          100% { transform: translateY(0px) scaleY(1); }
        }
        @keyframes pulseNode {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.4); }
        }
        .animate-wave-slow {
          animation: waveMotionSlow 18s ease-in-out infinite;
        }
        .animate-pulse-slow {
          animation: pulseNode 4s ease-in-out infinite;
          transform-origin: center;
        }
      `}</style>

      {/* BACKGROUND FISSO: Gradiente Blu -> Rosa e Data Wave SVG */}
      <AppBackground />

      {/* CONTENUTI DELLA PAGINA (In primo piano rispetto allo sfondo) */}
      <div className="relative z-10 flex flex-col items-center w-full">
        {/* 1. NAVBAR (Effetto Vetro) */}
        <nav className="fixed top-0 left-0 right-0 z-50 bg-white/60 backdrop-blur-md border-b border-white/40 px-6 sm:px-10 py-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-8">
            <GradientLogo onClick={() => scrollToSection("hero")} />

            <div className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
              <button onClick={() => scrollToSection("overview")} className="hover:text-slate-900 transition">Overview</button>
              <button onClick={() => scrollToSection("modules")} className="hover:text-slate-900 transition">Tools</button>
              <button onClick={() => scrollToSection("demo")} className="hover:text-slate-900 transition">Demo</button>
              <button onClick={() => scrollToSection("workspace")} className="hover:text-slate-900 transition">Workspace</button>
            </div>
          </div>

          <div>
            <button
              onClick={() => navigate("/login")}
              className="text-xs font-semibold px-4 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 via-pink-600 to-amber-400 text-white shadow-md hover:opacity-90 hover:shadow-lg transition duration-200"
            >
              Access Workspace
            </button>
          </div>
        </nav>

        {/* 2. HERO SECTION */}
        <section id="hero" className="pt-36 pb-24 px-6 text-center max-w-6xl mx-auto flex flex-col items-center justify-center min-h-[90vh]">
          <div className="max-w-4xl mx-auto flex flex-col items-center">
            <h1 className="text-6xl sm:text-7xl lg:text-8xl font-extrabold tracking-tight mb-8 pb-2 leading-normal select-none bg-gradient-to-r from-violet-500 via-pink-500 to-amber-400 bg-clip-text text-transparent">
              Synapse
            </h1>

            <h3 className="text-xl sm:text-3xl font-semibold text-slate-800 mb-8 leading-tight">
              From populations to comparable groups.<br />

            </h3>
            <p className="text-base sm:text-lg text-slate-600 font-normal max-w-2xl leading-relaxed mb-10">
              Configure, run and evaluate population matching in one interactive workspace. <br/> 
              Define your populations. Choose how they should be matched. <br/>
              Inspect balance, overlap and match quality before trusting the results. <br/>
              
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-4 mb-16">
              <button
                onClick={() => scrollToSection("overview")}
                className="bg-white/80 backdrop-blur-sm border border-white/60 hover:bg-white text-slate-800 font-semibold px-8 py-3.5 rounded-xl transition duration-200 shadow-sm hover:shadow"
              >
                Learn How It Works ↓
              </button>
              <button
                onClick={() => scrollToSection("demo")}
                className="bg-gradient-to-r from-purple-600 via-pink-600 to-amber-400 hover:opacity-90 text-white font-semibold px-8 py-3.5 rounded-xl shadow-md transition duration-200 hover:shadow-lg hover:scale-[1.02]">
                Try the Free Demo
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">
              <span className="px-3 py-1 rounded-full bg-white/70 backdrop-blur-sm text-blue-600 border border-white/50">Define</span>
              <span>·</span>
              <span className="px-3 py-1 rounded-full bg-white/70 backdrop-blur-sm text-purple-600 border border-white/50">Match</span>
              <span>·</span>
              <span className="px-3 py-1 rounded-full bg-white/70 backdrop-blur-sm text-pink-600 border border-white/50">Diagnose</span>
              <span>·</span>
              <span className="px-3 py-1 rounded-full bg-white/70 backdrop-blur-sm text-yellow-600 border border-white/50">Compare</span>
            </div>
          </div>
        </section>

        {/* 3. OVERVIEW SECTION */}
        <section id="overview" className="w-full py-24 px-6 border-t border-white/40 bg-white/40 backdrop-blur-md">
          <div className="max-w-5xl mx-auto">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-xs font-semibold uppercase tracking-widest bg-gradient-to-r from-purple-600 to-amber-400 bg-clip-text text-transparent mb-6">
                Overview
              </h2>

              <h3 className="text-3xl sm:text-4xl font-semibold text-slate-800 mb-6">
                What is Synapse?
              </h3>

              <p className="text-lg sm:text-2xl text-slate-800 font-semibold leading-relaxed mb-8">
                <span className="bg-gradient-to-r from-purple-600 to-amber-500 bg-clip-text text-transparent">
                  An interactive environment for population matching.
                </span>
              </p>

              <p className="text-base sm:text-lg text-slate-600 font-normal leading-relaxed mb-10">
                
                Synapse brings population definition, covariate selection, matching strategies and diagnostic tools into a single workspace. <br/> <br/> 
                

                <p className="text-lg sm:text-2xl text-slate-800 font-semibold leading-relaxed mb-8">
                <span className="bg-gradient-to-r from-purple-600 to-amber-500 bg-clip-text text-transparent">
                  Good matching is not just about finding pairs. It's about understanding whether they are comparable.
                </span>
              </p>

                Instead of treating matching as a black box, Synapse lets you inspect the entire process: <br/>    
                define the populations you want to compare, 
                configure the matching strategy and evaluate the quality of the resulting matches. <br/>      
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-24">
                {[
                  { title: "Define Populations", desc: "Select the treatment and comparison groups, choose relevant covariates and apply filtering or eligibility criteria." },
                  { title: "Build Different Matches", desc: "Explore representations, distance metrics and matching strategies to construct comparable populations." },
                  { title: "Diagnose Comparability", desc: "Evaluate balance, overlap, matching rates, unmatched observations and the quality of the resulting pairs." },
                ].map((cat) => (
                  <div key={cat.title} className="bg-white/70 backdrop-blur-md border border-white/50 p-6 rounded-xl shadow-sm">
                    <h5 className="text-2xl font-semibold bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent mb-2">
                      {cat.title}
                    </h5>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {cat.desc}
                    </p>
                  </div>
                ))}
              </div>

            <div className="text-center max-w-3xl mx-auto mb-12">
            
            <h4 className="text-xs font-semibold uppercase tracking-widest bg-gradient-to-r from-purple-600 to-amber-400 bg-clip-text text-transparent mb-6">
                A matching workflow you can inspect and refine
            </h4>

            <h3 className="text-3xl sm:text-4xl font-semibold text-slate-800 mb-6">
                How Synapse works
            </h3>

              <p className="text-base sm:text-2xl text-slate-600 font-semibold leading-relaxed mb-4">
                <span className="bg-gradient-to-r from-purple-600 to-amber-500 bg-clip-text text-transparent">
                  There is no single definition of a good match.
                </span>
              </p>

              <p className="text-base sm:text-lg text-slate-600 font-normal leading-relaxed mb-6">
                Different populations may require different covariates, representations, distance functions and matching strategies. <br/>
                Synapse lets you explore these choices interactively, inspect their effects on the resulting population <br/>
                and refine the analysis without rebuilding the workflow from scratch.<br/> <br/>
              </p>

              <p className="text-base sm:text-2xl text-slate-600 font-semibold leading-relaxed mb-4">
                <span className="bg-gradient-to-r from-purple-600 to-amber-500 bg-clip-text text-transparent">
                  A match is the beginning of the evaluation, not the end.
                </span>
              </p>

              <p className="text-base sm:text-lg text-slate-600 font-normal leading-relaxed mb-8">
                Compare balance before and after matching, inspect overlap and distance distributions, <br/> 
                identify unmatched observations and test alternative configurations.
                 <br/> <br/>
                
              </p>

            
              <div className="flex flex-col items-center">
                <span className="bg-gradient-to-r from-purple-600 via-pink-600 to-amber-400 bg-clip-text text-transparent font-extrabold text-sm">
                  Synapse
                </span>
                <div className="w-0.5 h-8 bg-slate-300 my-1"></div>

                <div className="px-5 py-2 rounded-lg bg-white/80 border border-white/60 text-blue-700 text-xs font-medium shadow-xs">
                  DEFINE TWO POPULATIONS
                </div>

                <div className="w-0.5 h-8 bg-slate-300 my-1"></div>
                

                

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
                  <div className="flex flex-col items-center bg-white/80 border border-white/60 p-5 rounded-xl shadow-xs">
                    <span className="text-xs font-semibold text-purple-600 tracking-wider mb-2">REPRESENT</span>
                    <div className="w-full border-t border-slate-200 my-2"></div>
                    <ul className="text-xs text-slate-600 space-y-1 text-center font-normal">
                      <li>Covariates</li>
                      <li>Propensity</li>
                    </ul>
                  </div>
                  <div className="flex flex-col items-center bg-white/80 border border-white/60 p-5 rounded-xl shadow-xs">
                    <span className="text-xs font-semibold text-pink-600 tracking-wider mb-2">MEASURE</span>
                    <div className="w-full border-t border-slate-200 my-2"></div>
                    <ul className="text-xs text-slate-600 space-y-1 text-center font-normal">
                      <li>Distance</li>
                      <li>Similarity</li>
                    </ul>
                  </div>
                  <div className="flex flex-col items-center bg-white/80 border border-white/60 p-5 rounded-xl shadow-xs">
                    <span className="text-xs font-semibold text-yellow-600 tracking-wider mb-2">CONSTRAIN</span>
                    <div className="w-full border-t border-slate-200 my-2"></div>
                    <ul className="text-xs text-slate-600 space-y-1 text-center font-normal">
                      <li>Exact Match</li>
                      <li>Caliper</li>
                    </ul>
                  </div>
                </div>

                <div className="w-0.5 h-8 bg-slate-300 my-1"></div>
                <div className="px-6 py-2 rounded-lg bg-white border border-white/60 text-slate-800 font-semibold text-xs tracking-wider shadow-xs">
                  MATCH
                </div>

                <div className="w-0.5 h-8 bg-slate-300 my-1"></div>
                <div className="px-6 py-2 rounded-lg bg-white border border-white/60 text-slate-800 font-semibold text-xs tracking-wider shadow-xs">
                  DIAGNOSE
                </div>

              <div className="w-0.5 h-8 bg-slate-300 my-1"></div>
                <div className="px-5 py-2 rounded-lg bg-white/80 border border-white/60 text-blue-700 text-xs font-medium shadow-xs">
                  ↺ REFINE
                </div>
              </div>

              <p className="text-base sm:text-lg text-slate-600 font-semibold leading-relaxed mt-10">
                One workspace. Multiple matching strategie. Inspectable results.
              </p>

            </div>
            </div>
          </div>
        </section>

        {/* 4. ANALYTICAL MODULES */}
        <section id="modules" className="w-full py-24 px-6 border-t border-white/40 bg-white/30 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-4">
              <h4 className="text-xs font-semibold uppercase tracking-widest bg-gradient-to-r from-purple-600 to-amber-400 bg-clip-text text-transparent mb-6">
                Analysis Tools
              </h4>
              <h3 className="text-3xl sm:text-4xl font-semibold text-slate-800 mb-10">
                Explore how populations can be  <br/> represented, compared and matched.
              </h3>
              <p className="text-lg sm:text-xl text-slate-800 font-semibold leading-relaxed mb-6">
                <span className="bg-gradient-to-r from-purple-600 to-amber-500 bg-clip-text text-transparent">
                  Specialized tools. Connected analysis.
                </span>
              </p>
              <p className="text-base sm:text-lg text-slate-600 font-normal leading-relaxed mb-10">
                Select a module below to discover how to compose your matching pipeline.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  id: "missingness", title: "Representation", subtitle: "How chould each population be represented?", tags: ["raw covariates", "Propensity Score", "Hybrid representation"], path: "/modules/missingness"
                },
                {
                  id: "structure", title: "Distance", subtitle: "How should similarity be measured?", tags: ["Euclidean", "Mahalanobis", "Gower", "Manhattan", "Hybrid"], path: "/modules/clustering-analytics"
                },
                {
                  id: "patterns", title: "Matching Strategies", subtitle: "How should observations be connected?", tags: ["Nearest Neighbor", "1:K Matching", "Optimal Matching", "Exact Matching", "Stratified Matching"], path: "/modules/data-structure"
                },
                {
                  id: "constraints", title: "Diagnostics", subtitle: "How do you know whether the match worked?", tags: ["Standardized Mean Difference", "Variance Ratio", "KS test", "Common Support"], path: "/modules/constraint-discovery"
                }
              ].map((mod) => (
                <div
                  key={mod.id}
                  onClick={() => navigateToModule(mod.path)}
                  className="group bg-white/70 backdrop-blur-md border border-white/50 hover:border-purple-400 p-6 rounded-xl flex flex-col justify-between cursor-pointer transition duration-200 shadow-sm hover:shadow-md hover:scale-[1.01]"
                >
                  <div>
                    <h4 className="text-lg font-semibold text-slate-800 mb-2 group-hover:text-amber-600 transition">
                      {mod.title}
                    </h4>
                    <p className="text-xs text-slate-800 mb-4 leading-relaxed font-normal">
                      {mod.subtitle}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mb-6">
                      {mod.tags.map((t) => (
                        <span key={t} className="text-[10px] bg-white/60 text-blue-400 px-2 py-0.5 rounded border border-white/50 font-medium">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-xs font-semibold bg-gradient-to-r from-purple-600 via-pink-500 to-amber-500 bg-clip-text text-transparent flex items-center gap-1 group-hover:translate-x-1 transition">
                    Explore →
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>


        {/* 5. DEMO SECTION */}
        <section id="demo" className="w-full min-h-screen flex flex-col items-center justify-center px-6 border-t border-white/40 bg-white/40 backdrop-blur-md py-20">
          <div className="max-w-4xl w-full bg-white/60 backdrop-blur-xl border border-white/80 shadow-[0_8px_32px_rgba(37,99,235,0.05)] p-12 sm:p-16 rounded-3xl text-center">
            <span className="text-xs font-bold uppercase tracking-widest bg-gradient-to-r from-purple-600 to-amber-400 bg-clip-text text-transparent mb-3 inline-block mb-8">
              Interactive Playground
            </span>
            <h2 className="text-3xl sm:text-5xl font-semibold text-slate-800 mb-8">
              Try Synapse in 2 Minutes
            </h2>
            <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto mb-10 leading-relaxed font-normal">
              Explore Synapse with toy datasets and preconfigured analytical workflows. <br/>
              Select a module, experiment with its parameters, inspect intermediate outputs and see how results can lead to the next analysis.
            </p>
            <button
              onClick={() => {
                sessionStorage.setItem("landing_last_section", "demo");
                navigate("/demo");
              }}
              className="bg-gradient-to-r from-purple-600 via-pink-600 to-amber-400 hover:opacity-90 text-white font-semibold text-base px-10 py-4 rounded-xl transition duration-200 shadow-md hover:shadow-lg hover:scale-[1.02]"
            >
              Start Demo
            </button>
          </div>
        </section>

        {/* 6. WORKSPACE SECTION WITH LOGIN */}
        <section id="workspace" className="w-full py-24 px-6 border-t border-white/40 bg-white/30 backdrop-blur-sm scroll-mt-16">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-xs font-semibold uppercase tracking-widest bg-gradient-to-r from-purple-600 to-amber-400 bg-clip-text text-transparent mb-6">
                Private Workspace
              </h2>
              <h3 className="text-3xl sm:text-4xl font-semibold text-slate-800">
                Ready to Analyze Your Own Data?
              </h3>
            </div>

            <div className="mb-12 bg-white/70 backdrop-blur-md border border-white/50 p-8 sm:p-10 rounded-2xl shadow-sm text-left">
              <h4 className="text-xl font-semibold text-slate-800 mb-4">
                Upload your datasets, configure your analyses and explore results in a persistent workspace.
              </h4>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed mb-4 font-normal">
                Save configurations, inspect intermediate artifacts, compare analytical outputs and reuse results across future modules. <br/> <br/>
                Don't have an account? Register here: link.
              </p>
            </div>

            {/* LOGIN FORM */}
            <div id="workspace-login" className="max-w-md mx-auto bg-white/80 backdrop-blur-lg border border-white/60 p-8 sm:p-10 rounded-2xl shadow-md">
              <h4 className="text-xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-amber-400 bg-clip-text text-transparent mb-6 text-center">
                Sign in to Workspace
              </h4>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="p-3 text-xs text-red-600 bg-red-50/80 border border-red-200 rounded-lg">
                    {error}
                  </div>
                )}
                
                <div>
                  <label className="block text-xs font-semibold mb-1 text-slate-600">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-white/90 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1 text-slate-600">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-white/90 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-purple-600 via-pink-600 to-amber-400 hover:opacity-90 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50 mt-2 shadow-md hover:shadow-lg"
                >
                  {isSubmitting ? "Authenticating..." : "Open Workspace"}
                </button>
              </form>
            </div>
          </div>
        </section>

        {/* 7. FOOTER */}
        <footer className="w-full bg-white/70 backdrop-blur-md border-t border-white/40 py-8 px-6 text-center text-xs text-slate-600">
          <div className="mb-2 font-extrabold text-sm bg-gradient-to-r from-purple-600 to-amber-400 bg-clip-text text-transparent">
            Synapse
          </div>
          <p>&copy; {new Date().getFullYear()} Synapse Analytics Environment. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
}