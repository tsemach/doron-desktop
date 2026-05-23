import { useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
 import { Button } from "@/components/ui/button";
import CaseManagement from "@/components/CaseManagment/CaseManagement";
import DocsManagement from "./components/DocsManagment/DocsManagement";

function Home() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [greeting, setGreeting] = useState<string>("");

  async function handleGreet() {
    try {
      const response = await invoke("greet", { name });
      setGreeting(String(response));
    } catch (error) {
      setGreeting("Failed to invoke greet command.");
      console.error(error);
    }
  }
  
  function handleCaseMagement() {
    navigate("/cases");
  }

  function handleDocsManagement() {
    navigate("/docs");
  }

  return (
    <main className="flex flex-col items-center pt-[10vh] text-center">
      <h1 className="text-2xl font-semibold">Welcome to Tauri + React</h1>

      <div className="flex justify-center gap-4 my-6">
        <a href="https://vite.dev" target="_blank" rel="noreferrer">
          <img src="/src/assets/vite.svg" className="size-20 p-6 transition-all hover:drop-shadow-[0_0_2em_#747bff]" alt="Vite logo" />
        </a>
        <a href="https://tauri.app" target="_blank" rel="noreferrer">
          <img src="/src/assets/tauri.svg" className="size-20 p-6 transition-all hover:drop-shadow-[0_0_2em_#24c8db]" alt="Tauri logo" />
        </a>
        <a href="https://www.typescriptlang.org/docs" target="_blank" rel="noreferrer">
          <img src="/src/assets/typescript.svg" className="size-20 p-6 transition-all hover:drop-shadow-[0_0_2em_#2d79c7]" alt="TypeScript logo" />
        </a>
      </div>

      <p>Use React for your GUI and call Tauri commands from the app.</p>

      <div className="flex justify-center gap-2 mt-4">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Enter a name..."
          className="border rounded px-3 py-2 text-sm"
        />
        <button type="button" onClick={handleGreet} className="border rounded px-4 py-2 text-sm font-medium hover:border-blue-500 transition-colors">
          Greet
        </button>
      </div>
      <div className="flex justify-center gap-8 mt-4">
        <button type="button" onClick={handleCaseMagement} className="border-4 text-[rgb(120,120,120)] hover:border-gray-400 rounded h-60 w-120 px-4 py-2 text-[48px] font-large hover:border-blue-500 transition-colors">
          Case Managment
        </button>
        <button type="button" onClick={handleDocsManagement} className="border-4 text-[rgb(120,120,120)] hover:border-gray-400 rounded h-60 w-120 px-4 py-2 text-[48px] font-large hover:border-blue-500 transition-colors">
          Documents Managment
        </button>
      </div>

      <h1 className="text-3xl font-bold underline text-blue-500 mt-6">Hello world!</h1>
      <h2 className="text-3xl font-bold underline text-gray-400">Hello world!</h2>

      <p>{greeting}</p>

      <button type="button" className="mt-4 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
        Click Managment
      </button>
       <Button variant="outline">Shadcn Button</Button>
    </main>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/cases" element={<CaseManagement />} />
      <Route path="/docs" element={<DocsManagement />} />
    </Routes>
  );
}

export default App;
