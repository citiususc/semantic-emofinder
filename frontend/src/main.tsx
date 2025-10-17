import './index.css';
import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import Finder from './components/Finder';
import Footer from './components/Footer';
import NavBar from './components/NavBar';
import Databases from "./components/Databases";
import Sparql from "./components/Sparql";


function App() {
    const [view, setView] = useState<"finder" | "databases" | "sparql">("finder");
    return (
        <main className="max-w-8xl mx-auto px-6 py-6 space-y-6">
            <NavBar view={view} setView={setView} />
            {view === "finder" && <Finder />}
            {view === "databases" && <Databases />}
            {view === "sparql" && <Sparql />}
            <Footer />
        </main>

    );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);