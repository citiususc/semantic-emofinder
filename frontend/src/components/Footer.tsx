import React from 'react';


const Footer: React.FC = () => (
  <footer className="bg-white border-t mt-12 py-6">
    <div className="max-w-6xl mx-auto flex items-center justify-between px-4">
      {/* Left logo */}
      <div>
        <img src="/usc.svg" alt="USC" className="h-20" />
      </div>

      {/* Center text */}
      <div className="flex-1 text-center text-sm text-gray-500">
        <p>© {new Date().getFullYear()} Universidade de Santiago de Compostela</p>
        <p>CiTIUS · Centro Singular de Investigación en Tecnoloxías Intelixentes</p>
      </div>

      {/* Right logo */}
      <div>
        <img src="/citius.png" alt="CiTIUS" className="h-20" />
      </div>
    </div>
  </footer>
);

export default Footer;