import React from 'react';


const Footer: React.FC = () => (
  <footer className="bg-white border-t mt-12 py-6">
    <div className="max-w-6xl mx-auto flex items-center justify-between px-4">
      {/* Left logo */}
      <div>
        <img src="/emofinder/usc.svg" alt="USC" className="h-20" />
      </div>

      {/* Center text */}
      <div className="flex-1 text-center text-sm text-gray-500">
        <p>© {new Date().getFullYear()} Universidade de Santiago de Compostela</p>
        <p>CiTIUS · Centro Singular de Investigación en Tecnoloxías Intelixentes</p>
        <p>The code is <a href="https://github.com/citiususc/semantic-emofinder" className="text-blue-600 hover:text-blue-800 underline">openly available</a> nd feedback
            or issues can be submitted <a href="https://github.com/citiususc/semantic-emofinder/issues" className="text-blue-600 hover:text-blue-800 underline">through the repository</a></p>
      </div>

      {/* Right logo */}
      <div>
        <img src="/emofinder/citius.png" alt="CiTIUS" className="h-20" />
      </div>
    </div>
  </footer>
);

export default Footer;