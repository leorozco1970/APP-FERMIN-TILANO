import React from 'react';

interface PageHeaderProps {
  title: string;
  description: string;
  imageUrl?: string;
  introText?: string;
  children?: React.ReactNode;
}

export function PageHeader({ title, description, imageUrl, introText, children }: PageHeaderProps) {
  // Default image if none provided
  const defaultImage = "https://images.unsplash.com/photo-1577896851231-70ef18881754?q=80&w=2070&auto=format&fit=crop";
  const bgImage = imageUrl || defaultImage;

  return (
    <div className="bg-[#0a0a0a] rounded-[2.5rem] shadow-[0_45px_100px_-20px_rgba(0,0,0,0.8)] border border-white/5 overflow-hidden mb-12 relative flex flex-col md:flex-row min-h-[200px] group transition-all duration-500">
      {/* Content side */}
      <div className="p-10 md:p-14 lg:px-16 flex-1 z-10 relative bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/95 to-transparent flex flex-col justify-center">
        <div className="flex flex-col mb-4">
          <span className="text-[10px] font-black text-[#C5A059] uppercase tracking-[0.5em] mb-2 drop-shadow-sm">GESTIÓN PEDAGÓGICA INTEGRAL</span>
          <div className="h-1 w-20 bg-gradient-to-r from-[#C5A059] to-transparent rounded-full shadow-[0_0_15px_rgba(197,160,89,0.3)]"></div>
        </div>
        <h1 className="text-3xl md:text-5xl font-black text-white mb-6 tracking-[0.02em] font-headings uppercase leading-tight drop-shadow-2xl text-balance">
          {title}
        </h1>
        <div className="space-y-4 max-w-4xl">
          <p className="text-slate-500 font-bold text-xs md:text-sm uppercase tracking-[0.2em] mb-1">
            {description}
          </p>
          
          {introText && (
            <div className="pt-6 border-t border-white/5">
              <p className="text-slate-300 text-sm md:text-base leading-relaxed text-justify max-w-2xl font-medium tracking-tight">
                {introText}
              </p>
            </div>
          )}
        </div>
        {children && (
          <div className="mt-10">
            {children}
          </div>
        )}
      </div>

      {/* Image side with gradient fade */}
      <div className="absolute right-0 top-0 bottom-0 w-full md:w-3/5 z-0 overflow-hidden opacity-60">
        <div className="absolute inset-0 bg-gradient-to-r from-[#1A1A1A] via-[#1A1A1A]/40 to-transparent z-10"></div>
        <img 
          src={bgImage} 
          alt="Header background" 
          className="w-full h-full object-cover object-center filter grayscale-[30%] brightness-75 group-hover:scale-105 transition-all duration-1000 ease-in-out"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 to-transparent mix-blend-overlay z-10"></div>
      </div>
    </div>
  );
}
