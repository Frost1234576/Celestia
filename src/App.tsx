import './index.css'
import './App.css'
import Navbar from './ui/Navbar'
import LayoutView from './ui/LayoutView'

export default function App() {
  return (
    <div className="app">
      <Navbar />
      <div className="app-body">
        <LayoutView />
      </div>
    </div>
  )
}