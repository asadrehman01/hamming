import React from "react";

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      message: "",
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || "Unexpected application error.",
    };
  }

  componentDidCatch(error, info) {
    console.error("AppErrorBoundary caught an error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      const isDev = process.env.NODE_ENV === "development";
      const displayMessage = isDev
        ? this.state.message
        : "Something went wrong. Please refresh and try again.";

      return (
        <div className="min-h-screen bg-[#0B0E14] text-white flex items-center justify-center p-6">
          <div className="w-full max-w-lg border border-white/10 bg-white/[0.02] p-6 rounded-2xl">
            <p className="text-[10px] tracking-[0.2em] text-red-400 font-mono mb-3">
              Runtime Error
            </p>
            <h1 className="text-xl font-medium tracking-tight mb-3">
              Something crashed on this screen.
            </h1>
            <p className="text-sm text-white/70 break-words mb-5">
              {displayMessage}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2 bg-white text-black text-[10px] tracking-[0.2em] font-medium"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;
