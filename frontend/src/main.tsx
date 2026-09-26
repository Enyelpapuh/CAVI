import { render } from 'preact'
import '@fontsource-variable/inter'
import '@material-symbols/font-400/outlined.css'
import './index.css'
import { App } from './app.tsx'

render(<App />, document.getElementById('app')!)
