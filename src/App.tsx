import { useEffect, useRef } from 'react';
import gsap from 'gsap';

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const buttonRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Background gradient pulse
      gsap.to('.bg-gradient', {
        scale: 1.1,
        opacity: 0.6,
        duration: 4,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      });

      // Entrance animation timeline
      const tl = gsap.timeline();
      
      tl.from(cardRef.current, {
        y: 50,
        opacity: 0,
        duration: 0.8,
        ease: 'power3.out',
      })
      .from(titleRef.current, {
        y: 20,
        opacity: 0,
        duration: 0.6,
        ease: 'power2.out',
      }, '-=0.4')
      .from(subtitleRef.current, {
        y: 20,
        opacity: 0,
        duration: 0.6,
        ease: 'power2.out',
      }, '-=0.4')
      .from(buttonRef.current, {
        scale: 0.9,
        opacity: 0,
        duration: 0.5,
        ease: 'back.out(1.7)',
      }, '-=0.2');

      // Button hover interactions
      if (buttonRef.current) {
        buttonRef.current.addEventListener('mouseenter', () => {
          gsap.to(buttonRef.current, { scale: 1.05, duration: 0.3, ease: 'power2.out' });
        });
        buttonRef.current.addEventListener('mouseleave', () => {
          gsap.to(buttonRef.current, { scale: 1, duration: 0.3, ease: 'power2.out' });
        });
      }
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="relative min-h-screen bg-slate-950 flex flex-col items-center justify-center overflow-hidden font-sans text-slate-200">
      {/* Background Gradients */}
      <div className="bg-gradient absolute top-0 -left-1/4 w-[150%] h-[50%] bg-gradient-to-b from-indigo-900/40 to-transparent blur-[120px] pointer-events-none" />
      <div className="bg-gradient absolute bottom-0 -right-1/4 w-[150%] h-[50%] bg-gradient-to-t from-fuchsia-900/30 to-transparent blur-[120px] pointer-events-none" />
      
      {/* Main Content Card with Glassmorphism */}
      <div 
        ref={cardRef}
        className="relative z-10 max-w-lg w-full px-6 py-12 md:p-12 mx-4 rounded-3xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-xl shadow-2xl shadow-indigo-900/20 text-center flex flex-col items-center"
      >
        {/* Logo Area */}
        <div className="w-20 h-20 mb-8 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
          <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>

        <h1 ref={titleRef} className="text-4xl md:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-400 mb-4">
          DriveTag AI
        </h1>
        
        <p ref={subtitleRef} className="text-lg text-slate-400 mb-10 max-w-sm leading-relaxed">
          The invisible AI assistant that magically organizes your Google Drive assets in the background.
        </p>

        {/* Action Button */}
        <a 
          ref={buttonRef}
          href="/.netlify/functions/auth-google" 
          className="group relative flex items-center justify-center gap-3 w-full sm:w-auto px-8 py-4 bg-white text-slate-900 font-semibold rounded-xl transition-colors duration-300 hover:bg-slate-100 shadow-lg"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Connect to Google Drive
        </a>

        <p className="mt-6 text-xs text-slate-500 max-w-xs">
          Secure, Zero-Retention OAuth. We never store your files.
        </p>
      </div>
    </div>
  );
}

export default App;
