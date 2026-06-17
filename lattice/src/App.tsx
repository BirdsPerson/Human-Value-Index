import { useSpreadsheet } from './ui/useSpreadsheet'
import { Toolbar } from './ui/Toolbar'
import { FormulaBar } from './ui/FormulaBar'
import { Grid } from './ui/Grid'
import { SheetTabs } from './ui/SheetTabs'
import { StatusBar } from './ui/StatusBar'

export default function App() {
  const api = useSpreadsheet()
  return (
    <div className="app">
      <Toolbar api={api} />
      <FormulaBar api={api} />
      <Grid api={api} />
      <SheetTabs api={api} />
      <StatusBar api={api} />
    </div>
  )
}
