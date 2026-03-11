import { getCurrentWindow } from '@tauri-apps/api/window';
import { PillView } from './components/PillView';
import { MainView } from './components/MainView';
import { useEffect, useState } from 'react';

function App() {
  const [windowLabel, setWindowLabel] = useState<string | null>(null);

  useEffect(() => {
    // Determine which window context we are in
    const appWindow = getCurrentWindow();
    setWindowLabel(appWindow.label);
    
    // For debugging in browser, fallback to main
    if (!appWindow.label) {
       setWindowLabel('main');
    }
  }, []);

  if (!windowLabel) return null;

  return (
    <>
      {windowLabel === 'pill' ? <PillView /> : <MainView />}
    </>
  );
}

export default App;
