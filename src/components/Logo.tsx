import React from 'react';

export const Logo: React.FC<{ size?: number; className?: string }> = ({ size = 32, className = '' }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 200 200" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <rect width="200" height="200" rx="40" fill="url(#paint0_linear)" />
    <path d="M100 45C65 45 45 55 45 65V135C45 145 65 155 100 155C135 155 155 145 155 135V65C155 55 135 45 100 45Z" fill="#1F2833" stroke="#45A29E" strokeWidth="8"/>
    <ellipse cx="100" cy="65" rx="55" ry="20" fill="url(#paint1_linear)" />
    <path d="M45 100C45 110 65 120 100 120C135 120 155 110 155 100" stroke="#45A29E" strokeWidth="8" strokeLinecap="round" />
    <path d="M85 75L115 145M115 75L85 145" stroke="#66FCF1" strokeWidth="12" strokeLinecap="round" style={{ mixBlendMode: 'screen' }} opacity="0.6"/>
    
    <defs>
      <linearGradient id="paint0_linear" x1="0" y1="0" x2="200" y2="200" gradientUnits="userSpaceOnUse">
        <stop stopColor="#0B0C10" />
        <stop offset="1" stopColor="#1F2833" />
      </linearGradient>
      <linearGradient id="paint1_linear" x1="45" y1="65" x2="155" y2="65" gradientUnits="userSpaceOnUse">
        <stop stopColor="#45A29E" />
        <stop offset="1" stopColor="#66FCF1" />
      </linearGradient>
    </defs>
  </svg>
);
