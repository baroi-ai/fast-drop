"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#0a0d14] flex flex-col items-center justify-center text-center p-6">
      {/* Branding Logo */}
      <div className="flex items-center gap-3 mb-12">
        <img
          src="/fast-drop/logo.png"
          alt="FastDrop"
          className="w-16 h-16 rounded-xl border border-[#00E585]/50 shadow-[0_0_20px_rgba(0,229,133,0.3)]"
        />
        <span className="text-4xl font-extrabold tracking-tight text-white">
          Fast<span className="text-[#00E585]">Drop</span>
        </span>
      </div>

      {/* 404 Message */}
      <div className="space-y-6">
        <h1 className="text-8xl font-black text-white/5 font-mono leading-none">
          404
        </h1>
        <div className="space-y-2">
          <h2 className="text-[#00E585] font-mono text-xl uppercase tracking-widest">
            Signal Lost in Transit
          </h2>
          <p className="text-gray-500 text-sm max-w-xs mx-auto">
            The link you followed is invalid or the secure tunnel has collapsed.
          </p>
        </div>
      </div>

      {/* Manual Home Button */}
      <div className="mt-12">
        <Link href="/fast-drop">
          <button className="px-8 py-3 bg-[#00E585] hover:bg-[#00C875] text-black font-bold rounded-xl transition-all shadow-lg shadow-[#00E585]/20 flex items-center gap-2 group">
            <svg
              className="w-5 h-5 transition-transform group-hover:-translate-x-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Return Home
          </button>
        </Link>
      </div>

      {/* Decorative Grid Line */}
      <div className="fixed bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent"></div>
    </div>
  );
}
