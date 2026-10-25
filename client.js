/**
 * 战术大屏 —— 浏览器半端
 * 设置里一页 + 会话顶栏一个入口；入口统一走电脑默认浏览器，设置里保留内嵌预览。
 */
window.__ModuleLoader__.load({
  id: 'dsh-neural-board',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const EMBED = '/api/neural-board/index.html#neural'
    const EXTERNAL = 'http://127.0.0.1:7800/'
    const KEY = 'neuralBoardEnabled'
    const EVT = 'neural-board-toggle'

    const readOn = () => { try { return localStorage.getItem(KEY) !== '0' } catch (e) { return true } }

    function openExternal(url) {
      try {
        const a = document.createElement('a')
        a.href = url
        a.target = '_blank'
        a.rel = 'noopener'
        document.body.appendChild(a)
        a.click()
        a.remove()
      } catch (e) {}
    }

    function useEnabled() {
      const [on, setOn] = React.useState(readOn)
      React.useEffect(() => {
        const f = () => setOn(readOn())
        window.addEventListener(EVT, f)
        return () => window.removeEventListener(EVT, f)
      }, [])
      const set = (v) => {
        try { localStorage.setItem(KEY, v ? '1' : '0') } catch (e) {}
        window.dispatchEvent(new Event(EVT))
        setOn(v)
      }
      return [on, set]
    }

    const btnStyle = {
      border: '1px solid var(--dsw-border,#3a3a3a)', background: 'transparent', color: 'inherit',
      borderRadius: 6, fontSize: 12, padding: '3px 10px', cursor: 'pointer', opacity: .9,
    }

    function HeaderBtn() {
      const [on] = useEnabled()
      if (!on) return null
      return h('button', {
        title: '在默认浏览器打开战术大屏',
        onClick: () => openExternal(EXTERNAL),
        style: {
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 24,
          padding: '0 8px', borderRadius: 6, cursor: 'pointer', border: '1px solid transparent',
          background: 'transparent', color: 'inherit', fontSize: 12, lineHeight: 1, whiteSpace: 'nowrap',
        },
      }, '战术大屏')
    }

    function Panel() {
      const [on, setOn] = useEnabled()
      const [open, setOpen] = React.useState(false)
      const [warn, setWarn] = React.useState(false)
      return h('div', { style: { maxWidth: 900, padding: '2px 0 14px' } },
        h('div', { style: { marginBottom: 8 } },
          h('div', { style: { fontSize: 15, fontWeight: 600, marginBottom: 2 } }, '战术大屏'),
          h('div', { style: { fontSize: 12, opacity: 0.62, lineHeight: '18px' } },
            'NEURAL 星环：会话、token、轮次全部取本机 DSH 实时数据。入口走电脑默认浏览器，这里只做预览。')),
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' } },
          h('button', { onClick: () => openExternal(EXTERNAL), style: Object.assign({}, btnStyle, { background: 'rgba(76,139,245,.18)' }) }, '在默认浏览器打开'),
          h('button', { onClick: () => setOn(!on), style: btnStyle }, on ? '入口：已开' : '入口：已关'),
          h('span', { style: { fontSize: 11, opacity: .5 } }, '关掉之后顶栏那个按钮会收起来'),
          h('div', { style: { flex: 1 } }),
          h('button', { onClick: () => (open ? setOpen(false) : setWarn(true)), style: btnStyle }, open ? '收起预览' : '内嵌预览')),
        warn ? h('div', {
          style: {
            border: '1px solid rgba(255,176,32,.55)', background: 'rgba(255,176,32,.08)',
            borderRadius: 10, padding: '10px 12px', marginBottom: 10, fontSize: 12, lineHeight: '19px',
          },
        },
        h('div', { style: { fontWeight: 600, marginBottom: 4 } }, '小贴士'),
        h('div', null, '内置预览会走 DSH 的内嵌浏览器，实时消耗 token，长期挂着不划算。'),
        h('div', { style: { opacity: .7 } }, '长期使用请走上面的「在默认浏览器打开」。'),
        h('div', { style: { display: 'flex', gap: 8, marginTop: 8 } },
          h('button', { onClick: () => setWarn(false), style: btnStyle }, '退出'),
          h('button', {
            onClick: () => { setWarn(false); setOpen(true) },
            style: Object.assign({}, btnStyle, { background: 'rgba(255,176,32,.18)' }),
          }, '继续预览'))) : null,
        open ? h('div', { style: { border: '1px solid var(--dsw-border,#333)', borderRadius: 10, overflow: 'hidden', height: 520 } },
          h('iframe', {
            src: EMBED, title: '战术大屏预览', allow: 'fullscreen',
            style: { width: '100%', height: '100%', border: 0, display: 'block', background: '#05070a' },
          })) : null)
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const slots = (typeof ctx.get === 'function' ? ctx.get('slots') : undefined) || ctx.slots
        if (!slots) return
        slots.inject('settings.section', () => slots.register(
          { name: 'settings.section', id: 'neural-board', order: 27, label: '战术大屏' },
          () => h(Panel),
        ))
        try {
          slots.inject('conversation.session.header.actions', () => slots.register(
            { name: 'conversation.session.header.actions', id: 'neural-board-quick', order: 41 },
            () => h(HeaderBtn),
          ))
        } catch (e) { /* 老版本没有这个槽位就算了 */ }
      },
    }
  },
})
