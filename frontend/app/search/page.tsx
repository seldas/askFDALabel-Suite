"use client"
import { useState } from "react";
import "./search_global.css";
import Header from "../components/Header";
import ChatPanel from "./components/ChatPanel";
import Results from "./components/Results";
import { SearchProvider } from "./context/SearchContext";

const App = () => {
  const [hasSearched, setHasSearched] = useState(false);
  
  return (
    <SearchProvider>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <Header/>
        <div className="app-container" style={{ flex: 1, height: 'auto' }}>
          <div className="chat-column">
             <ChatPanel onSearch={() => setHasSearched(true)} />
          </div>
          <div className="results-column">
             <Results hasSearched={hasSearched} />
          </div>
        </div>
      </div>
    </SearchProvider>
  );
};

export default App;
