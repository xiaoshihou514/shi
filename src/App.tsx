import './App.css'
import { Map } from '@vis.gl/react-maplibre'

function App() {
  return <Map
    initialViewState={{
      longitude: -100,
      latitude: 40,
      zoom: 3.5
    }}
    style={{width: 600, height: 400}}
    mapStyle="https://demotiles.maplibre.org/style.json"
  />;
}

export default App
