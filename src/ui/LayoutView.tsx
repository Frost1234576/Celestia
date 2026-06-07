import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import './LayoutView.css'
import Sidebar from './Sidebar'
import EditorView from './EditorView'
import TerminalView from './TerminalView'
import AgentChat from './AgentChat'
import { useLayoutStore } from '../core/layout'

export default function LayoutView() {
  const {
    sidebarWidth,
    terminalHeight,
    chatWidth,
    sidebarVisible,
    terminalVisible,
    chatVisible,
    setSidebarWidth,
    setTerminalHeight,
    setChatWidth,
  } = useLayoutStore()

  return (
    <div className="layout-view">
      <Allotment onChange={(sizes) => { if (sizes[0] !== undefined) setSidebarWidth(sizes[0]) }}>
        <Allotment.Pane minSize={160} maxSize={480} preferredSize={sidebarWidth} visible={sidebarVisible}>
          <Sidebar />
        </Allotment.Pane>

        <Allotment.Pane minSize={300}>
          <Allotment
            onChange={(sizes) => { if (sizes[1] !== undefined) setChatWidth(sizes[1]) }}
          >
            <Allotment.Pane minSize={400}>
              <Allotment
                vertical
                onChange={(sizes) => { if (sizes[1] !== undefined) setTerminalHeight(sizes[1]) }}
              >
                <Allotment.Pane minSize={100}>
                  <EditorView />
                </Allotment.Pane>
                <Allotment.Pane minSize={80} maxSize={600} preferredSize={terminalHeight} visible={terminalVisible}>
                  <TerminalView />
                </Allotment.Pane>
              </Allotment>
            </Allotment.Pane>

            <Allotment.Pane minSize={240} maxSize={520} preferredSize={chatWidth} visible={chatVisible}>
              <AgentChat />
            </Allotment.Pane>
          </Allotment>
        </Allotment.Pane>
      </Allotment>
    </div>
  )
}
