import React, { useEffect, useRef } from 'react'
import * as d3 from 'd3'

const DEFAULT_FONT_SIZE = 16
const FONT_SIZE_MIN = 11
const FONT_SIZE_MAX = 28
const LINE_HEIGHT = 1.15
// Keep inner paddings minimal (Plotly-like tight layout).
const TEXT_PADDING = 2

const BAD_LABELS = new Set(['', 'undefined', 'null', 'n/a', 'na', 'none', 'nan', '<na>', '\u2014', '-'])

function isBadLabel(n) {
  if (n == null) return true
  const s = String(n).trim()
  if (!s) return true
  return BAD_LABELS.has(s.toLowerCase())
}

function D3Sunburst({
  payload,
  onSizeChange,
  showFullText: showFullTextProp,
  textAlongCircumference: textAlongCircumferenceProp,
  dynamicFontSize: dynamicFontSizeProp,
}) {
  const containerRef = useRef(null)
  const tooltipRef = useRef(null)

  useEffect(() => {
    if (!payload?.tree) return

    const container = containerRef.current
    if (!container) return
    container.innerHTML = ''

    let tooltip = tooltipRef.current
    if (!tooltip) {
      tooltip = document.createElement('div')
      tooltip.className = 'd3-sunburst-tooltip'
      tooltip.style.display = 'none'
      document.body.appendChild(tooltip)
      tooltipRef.current = tooltip
    }

    const hideTooltip = () => {
      if (tooltipRef.current) tooltipRef.current.style.display = 'none'
    }

    try {
      const { tree: rawTree, settings } = payload
      // A nameless synthetic root with a single top-level child used to render
      // as an empty white disk with «Всего: 1». Show that child in the centre
      // instead (same as Plotly, where the sole top node is the centre disk);
      // its column value stays visible and the rings get more room.
      const collapsedRoot = Boolean(
        isBadLabel(rawTree?.name)
        && Array.isArray(rawTree?.children)
        && rawTree.children.length === 1
        && Array.isArray(rawTree.children[0]?.children)
        && rawTree.children[0].children.length > 0
      )
      const tree = collapsedRoot ? rawTree.children[0] : rawTree
      const palette = settings?.palette || []
      const baseSize = settings?.baseSize || 800
      const maxSize = settings?.maxSize || 5000
      // Live checkbox props override payload.settings so toggles rebuild immediately.
      const showFullText = showFullTextProp != null
        ? Boolean(showFullTextProp)
        : Boolean(settings?.showFullText)
      const textAlongCircumference = textAlongCircumferenceProp != null
        ? Boolean(textAlongCircumferenceProp)
        : Boolean(settings?.textAlongCircumference)
      const dynamicFontSize = dynamicFontSizeProp != null
        ? Boolean(dynamicFontSizeProp)
        : Boolean(settings?.dynamicFontSize)
      const useGradient = settings?.useGradient !== false
      const colorMap = settings?.colorMap || {}

      const diameter = Math.min(maxSize, baseSize)
      const radius = diameter / 2

      // Preserve input/table order (backend sets _order). Never size-sort.
      const root = d3
        .hierarchy(tree)
        .sum(d => (d.children?.length ? 0 : (d.value || 0)))
        .sort((a, b) => {
          const ao = a.data?._order
          const bo = b.data?._order
          if (ao != null && bo != null) return ao - bo
          return 0
        })

      // D3 angles: 0 at 12:00, increasing clockwise. Sibling order matches
      // the table / backend children array from 12:00 CW.
      const partition = d3.partition().size([2 * Math.PI, radius])
      partition(root)
      root.each(d => {
        d.current = d
      })

      if (onSizeChange) onSizeChange(diameter)

      const svg = d3
        .select(container)
        .append('svg')
        .attr('width', diameter)
        .attr('height', diameter)
        .style('width', `${diameter}px`)
        .style('height', `${diameter}px`)
        // Positive origin viewBox — avoids PDF/canvas crop of negative-viewBox SVGs
        .attr('viewBox', `0 0 ${diameter} ${diameter}`)
        .attr('data-chart-diameter', String(diameter))
        .style('cursor', 'grab')

      const g = svg.append('g').attr('transform', `translate(${radius},${radius})`)

      const baseFont = DEFAULT_FONT_SIZE
      const context = document.createElement('canvas').getContext('2d')

      const measureWith = (fontPx, text) => {
        context.font = `${fontPx}px Arial, sans-serif`
        return context.measureText(String(text ?? '')).width
      }

      const ellipsize = (text, maxWidth, fontPx) => {
        const s = String(text ?? '')
        if (maxWidth <= 0) return ''
        if (measureWith(fontPx, s) <= maxWidth) return s
        const ellipsis = '…'
        if (measureWith(fontPx, ellipsis) > maxWidth) return ''
        let lo = 0
        let hi = s.length
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2)
          const candidate = s.slice(0, mid) + ellipsis
          if (measureWith(fontPx, candidate) <= maxWidth) lo = mid
          else hi = mid - 1
        }
        return s.slice(0, lo) + ellipsis
      }

      const truncateNoEllipsis = (text, maxWidth, fontPx) => {
        const s = String(text ?? '')
        if (maxWidth <= 0) return ''
        if (measureWith(fontPx, s) <= maxWidth) return s
        let lo = 0
        let hi = s.length
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2)
          const candidate = s.slice(0, mid)
          if (measureWith(fontPx, candidate) <= maxWidth) lo = mid
          else hi = mid - 1
        }
        return s.slice(0, lo)
      }

      // ---- Label layout: every label is fitted inside its own cell ----
      // A cell is an annular sector. Labels are centred on the cell middle
      // (radial mid of the ring + angular mid of the sector), wrapped and,
      // if needed, shrunk so the whole block stays inside the sector.
      const FULL_TEXT_FONT_MIN = 7
      const wordWidthCache = new Map()
      const wordWidth = (fontPx, w) => {
        const k = `${fontPx}|${w}`
        let v = wordWidthCache.get(k)
        if (v == null) {
          v = measureWith(fontPx, w)
          wordWidthCache.set(k, v)
        }
        return v
      }

      const wrapWords = (words, fontPx, maxWidth) => {
        const space = wordWidth(fontPx, ' ')
        const lines = []
        let cur = ''
        let curW = 0
        let maxLineW = 0
        for (const w of words) {
          const ww = wordWidth(fontPx, w)
          if (!cur) {
            cur = w
            curW = ww
          } else if (curW + space + ww <= maxWidth) {
            cur += ` ${w}`
            curW += space + ww
          } else {
            lines.push(cur)
            maxLineW = Math.max(maxLineW, curW)
            cur = w
            curW = ww
          }
        }
        if (cur) {
          lines.push(cur)
          maxLineW = Math.max(maxLineW, curW)
        }
        return { lines, maxLineW }
      }

      const sectorGeom = (d) => {
        const r0 = Math.max(0, d.y0)
        const r1 = Math.max(r0, d.y1)
        const span = Math.max(0, d.x1 - d.x0)
        return {
          r0,
          r1,
          ring: r1 - r0,
          midR: (r0 + r1) / 2,
          half: span / 2,
          full: span >= 2 * Math.PI - 1e-6,
        }
      }

      // Max straight line width for a text block of height blockH centred on
      // the cell middle.
      // 'tan': text runs across the sector (along the arc), lines stack radially.
      const tangentialWidth = (g, blockH) => {
        if (blockH > g.ring - TEXT_PADDING * 2) return 0
        const ri = g.midR - blockH / 2
        const ro = g.midR + blockH / 2
        const outer = g.r1 - TEXT_PADDING
        let w = 2 * Math.sqrt(Math.max(0, outer * outer - ro * ro))
        if (!g.full && g.half < Math.PI / 2) {
          w = Math.min(w, 2 * (ri * Math.tan(g.half) - TEXT_PADDING / Math.cos(g.half)))
        }
        return Math.max(0, w)
      }
      // 'rad': text runs from the centre outwards, lines stack across the sector.
      const radialWidth = (g, blockH) => {
        const outer = g.r1 - TEXT_PADDING
        const halfH = blockH / 2
        if (halfH >= outer) return 0
        let w = g.ring - TEXT_PADDING * 2
        w = Math.min(w, 2 * (Math.sqrt(outer * outer - halfH * halfH) - g.midR))
        if (!g.full && g.half < Math.PI / 2) {
          const s = Math.sin(g.half)
          if (s <= 0) return 0
          w = Math.min(w, 2 * (g.midR - (halfH + TEXT_PADDING) / s))
        }
        return Math.max(0, w)
      }
      const widthFor = (g, orient, blockH) => (
        orient === 'tan' ? tangentialWidth(g, blockH) : radialWidth(g, blockH)
      )

      const MAX_FIT_LINES = 12
      const tryFit = (words, g, orient, fontPx) => {
        const lh = fontPx * LINE_HEIGHT
        for (let n = 1; n <= MAX_FIT_LINES; n += 1) {
          const W = widthFor(g, orient, n * lh)
          if (W <= 0) return null
          const { lines, maxLineW } = wrapWords(words, fontPx, W)
          if (lines.length <= n && maxLineW <= W) return { orient, fontPx, lines }
        }
        return null
      }

      const layoutLabel = (node) => {
        const d = node.current
        if (!arcVisible(d)) return null
        const rawName = String(node.data?.name || '').trim()
        if (!rawName || isBadLabel(rawName)) return null
        const words = rawName.split(/\s+/).filter(Boolean)
        if (!words.length) return null
        const g = sectorGeom(d)
        if (g.ring < 4) return null

        const maxF = dynamicFontSize ? FONT_SIZE_MAX : baseFont
        const floorF = showFullText ? FULL_TEXT_FONT_MIN : FONT_SIZE_MIN
        const best = { tan: null, rad: null }
        for (const o of ['tan', 'rad']) {
          for (let f = maxF; f >= floorF; f -= 1) {
            const r = tryFit(words, g, o, f)
            if (r) {
              best[o] = r
              break
            }
          }
        }
        // Text follows the long side of the cell (never "across" it).
        const arcLen = 2 * g.half * g.midR
        const longSide = arcLen >= g.ring ? 'tan' : 'rad'

        let pick = null
        if (textAlongCircumference) {
          // "Надпись по окружности": along the arc whenever it fits; very
          // thin slivers fall back to radial instead of disappearing.
          pick = best.tan || best.rad
        } else if (best.tan && best.rad) {
          if (best.tan.fontPx !== best.rad.fontPx) {
            pick = best.tan.fontPx > best.rad.fontPx ? best.tan : best.rad
          } else if (best.tan.lines.length !== best.rad.lines.length) {
            pick = best.tan.lines.length < best.rad.lines.length ? best.tan : best.rad
          } else {
            pick = best[longSide]
          }
        } else {
          pick = best.tan || best.rad
        }
        if (pick) return pick

        // Nothing fits even at the minimum font.
        const orient = textAlongCircumference ? 'tan' : longSide
        const fontPx = floorF
        const lh = fontPx * LINE_HEIGHT
        if (showFullText) {
          // Keep the whole string (no ellipsis), wrapped to the cell width.
          const W = Math.max(widthFor(g, orient, lh), fontPx * 4)
          return { orient, fontPx, lines: wrapWords(words, fontPx, W).lines }
        }
        // Truncated mode: at most 2 lines, last one ellipsized.
        for (const o of [orient, orient === 'tan' ? 'rad' : 'tan']) {
          const n = o === 'tan'
            ? Math.max(1, Math.min(2, Math.floor((g.ring - TEXT_PADDING * 2) / lh)))
            : 2
          const W = widthFor(g, o, n * lh)
          if (W < fontPx * 1.5) continue
          const { lines } = wrapWords(words, fontPx, W)
          const overflow = lines.length > n
          const out = lines.slice(0, n).map((l, i, arr) => {
            const isLast = i === arr.length - 1
            if (!isLast) return truncateNoEllipsis(l, W, fontPx)
            const s = overflow ? `${l}…` : l
            return measureWith(fontPx, s) > W ? ellipsize(l, W, fontPx) : s
          }).filter(Boolean)
          if (out.length) return { orient: o, fontPx, lines: out }
        }
        return null
      }

      const color = d3.scaleOrdinal(
        palette.length ? palette : d3.quantize(d3.interpolateRainbow, (root.children?.length || 1) + 1)
      )
      if (collapsedRoot) color(tree?.name || '')

      const blend = (colorHex, ratio) => {
        const c = d3.color(colorHex)
        if (!c) return colorHex
        const r = Math.round(c.r + (255 - c.r) * ratio)
        const gVal = Math.round(c.g + (255 - c.g) * ratio)
        const b = Math.round(c.b + (255 - c.b) * ratio)
        return `rgb(${r}, ${gVal}, ${b})`
      }

      // Resolve user color_map from any ancestor (root / L1), then palette.
      // Depth gradient lightens from that base — never replaces custom colors.
      const resolveBaseColor = (d) => {
        let a = d
        while (a) {
          const name = a.data?.name
          if (name && colorMap[name]) return { base: colorMap[name], depthFromBase: d.depth - a.depth }
          a = a.parent
        }
        let l1 = d
        while (l1 && l1.depth > 1) l1 = l1.parent
        const key = l1?.data?.name || d.data?.name || ''
        return { base: color(key), depthFromBase: l1 ? d.depth - l1.depth : Math.max(0, d.depth - 1) }
      }

      const fillFor = (d) => {
        const { base, depthFromBase } = resolveBaseColor(d)
        if (!useGradient || depthFromBase <= 0) return base
        return blend(base, Math.min(0.6, 0.22 * depthFromBase))
      }

      const arc = d3
        .arc()
        .startAngle(d => d.x0)
        .endAngle(d => d.x1)
        .padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.0001))
        .padRadius(radius * 1.5)
        .innerRadius(d => d.y0)
        .outerRadius(d => Math.max(d.y0, d.y1 - 1))

      const nodes = root.descendants().slice(1)
      nodes.forEach((n, idx) => {
        n._idx = idx
      })

      const arcVisible = d => d.y1 > 0 && d.y0 >= 0 && d.x1 > d.x0

      let centerRing = radius / (root.height + 1)
      const centerG = g.append('g').attr('class', 'd3-sunburst-center')
      // Centre disk is flush with the first ring and tinted like the slices
      // (slices are drawn at ~0.7 opacity on white, i.e. blend 0.3) so it
      // never looks like an empty white hole.
      const centerFillFor = (node) => {
        if (!node || node === root) {
          const name = root.data?.name
          if (name && colorMap[name]) return blend(colorMap[name], 0.3)
          if (collapsedRoot) return blend(color(name || ''), 0.3)
          return '#eef1f5'
        }
        return blend(fillFor(node), 0.3)
      }
      const parentCircle = centerG
        .append('circle')
        .datum(root)
        .attr('r', Math.max(1, centerRing - 1))
        .attr('fill', centerFillFor(root))
        .attr('stroke', 'none')
        .attr('pointer-events', 'all')

      const centerText = centerG
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('fill', '#111')
        .attr('pointer-events', 'none')
        .style('font-weight', 700)
        .style('font-family', 'Arial, sans-serif')
        .style('font-size', `${baseFont}px`)

      const setCenterLabel = (node) => {
        let text = String(node?.data?.name || '').trim()
        // Fallback when synthetic multi-child root has empty name
        if (!text || isBadLabel(text)) {
          const kids = node?.children || []
          if (kids.length) text = `Всего: ${kids.length}`
          else text = 'Корень'
        }
        centerText.selectAll('tspan').remove()
        centerText.text('')
        const words = text.split(/\s+/).filter(Boolean)
        const R = Math.max(1, centerRing - 1)
        const startF = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, baseFont + (dynamicFontSize ? 6 : 2)))
        const floorF = showFullText ? 8 : 10
        const widthAt = (blockH) => {
          const h = blockH / 2
          if (h >= R) return 0
          return Math.max(0, 2 * Math.sqrt(R * R - h * h) * 0.9 - TEXT_PADDING * 2)
        }
        let fontPx = floorF
        let lines = null
        for (let f = startF; f >= floorF && !lines; f -= 1) {
          for (let n = 1; n <= 8; n += 1) {
            const W = widthAt(n * f * 1.1)
            if (W <= 0) break
            const r = wrapWords(words, f, W)
            if (r.lines.length <= n && r.maxLineW <= W) {
              fontPx = f
              lines = r.lines
              break
            }
          }
        }
        if (!lines) {
          const W = Math.max(widthAt(3 * fontPx * 1.1), fontPx * 4)
          const all = wrapWords(words, fontPx, W).lines
          if (showFullText) lines = all
          else {
            lines = all.slice(0, 3)
            if (all.length > 3) {
              const s = `${lines[2]}…`
              lines[2] = measureWith(fontPx, s) > W ? ellipsize(lines[2], W, fontPx) : s
            }
          }
        }
        centerText.style('font-size', `${fontPx}px`)
        const lineDy = fontPx * 1.1
        const startDy = -((lines.length - 1) / 2) * lineDy
        lines.forEach((l, i) => {
          centerText
            .append('tspan')
            .attr('x', 0)
            .attr('dy', i === 0 ? startDy : lineDy)
            .text(l)
        })
      }

      setCenterLabel(root)

      const pathHoverText = (d) => {
        const names = d.ancestors()
          .map(a => a?.data?.name)
          .map(n => (n == null ? '' : String(n).trim()))
          .filter(n => n && !isBadLabel(n))
          .reverse()
        if (!names.length) {
          const self = String(d?.data?.name || '').trim()
          return self && !isBadLabel(self) ? self : '—'
        }
        return names.join(' → ')
      }

      const showTooltip = (event, d) => {
        const tip = tooltipRef.current
        if (!tip) return
        const path = pathHoverText(d)
        tip.innerHTML = `<div><b>Путь:</b> ${path.replace(/</g, '&lt;')}</div>`
        tip.style.display = 'block'
        const pad = 12
        const offsetX = 18
        const offsetY = 22
        const x = Math.min(event.clientX + offsetX, window.innerWidth - tip.offsetWidth - pad)
        const y = Math.min(event.clientY + offsetY, window.innerHeight - tip.offsetHeight - pad)
        tip.style.left = `${Math.max(pad, x)}px`
        tip.style.top = `${Math.max(pad, y)}px`
      }

      const path = g
        .append('g')
        .selectAll('path')
        .data(nodes)
        .join('path')
        .attr('fill', d => fillFor(d))
        .attr('fill-opacity', d => (arcVisible(d.current) ? (d.children ? 0.7 : 0.55) : 0))
        .attr('stroke', 'none')
        .attr('stroke-width', 0)
        .attr('d', d => arc(d.current))
        .attr('pointer-events', d => (arcVisible(d.current) ? 'auto' : 'none'))
        .on('mousemove', function (event, d) {
          showTooltip(event, d)
        })
        .on('mouseleave', hideTooltip)

      const labelG = g
        .append('g')
        .attr('class', 'd3-sunburst-text')
        .attr('pointer-events', 'none')
        .attr('text-anchor', 'middle')
        .style('user-select', 'none')
        .style('font-family', 'Arial, sans-serif')

      // Both orientations are centred on the cell middle (midR, mid angle).
      // 'tan' — along the arc, upright for the viewer (bottom half flipped).
      // 'rad' — from the centre outwards, left half flipped so it is not
      // upside-down.
      const labelTransform = (d, orient) => {
        const midAngle = (d.x0 + d.x1) / 2
        const midR = (Math.max(0, d.y0) + Math.max(0, d.y1)) / 2
        const deg = (midAngle * 180) / Math.PI
        if (orient === 'tan') {
          const flip = midAngle > Math.PI / 2 && midAngle < (3 * Math.PI) / 2
          return `rotate(${deg - 90}) translate(${midR},0) rotate(${flip ? -90 : 90})`
        }
        const flip = midAngle > Math.PI
        return `rotate(${deg - 90}) translate(${midR},0) rotate(${flip ? 180 : 0})`
      }

      const defs = svg.append('defs')

      const renderLabels = () => {
        labelG.selectAll('*').remove()
        defs.selectAll('clipPath').remove()
        // Clip only in truncated mode. Full-text must keep the whole string
        // visible; clipPath mid-word cuts look like ellipsis.
        if (!showFullText) {
          nodes.forEach((node) => {
            defs.append('clipPath')
              .attr('id', `d3-clip-${node._idx}`)
              .append('path')
              .attr('d', arc(node.current))
          })
        }
        nodes.forEach((node) => {
          const layout = layoutLabel(node)
          if (!layout || !layout.lines.length) return
          const { orient, fontPx, lines } = layout

          const dCur = node.current
          const clipped = labelG.append('g')
          if (!showFullText) {
            clipped.attr('clip-path', `url(#d3-clip-${node._idx})`)
          }

          const t = clipped
            .append('text')
            .attr('transform', labelTransform(dCur, orient))
            .attr('data-orient', orient)
            .attr('dominant-baseline', 'middle')
            .attr('text-anchor', 'middle')
            .attr('fill', '#111')
            .style('font-size', `${fontPx}px`)
            .style('paint-order', 'stroke')
            .style('stroke', '#fff')
            .style('stroke-width', 2)
            .style('stroke-linejoin', 'round')

          const lineDy = fontPx * LINE_HEIGHT
          const startDy = -((lines.length - 1) / 2) * lineDy
          lines.forEach((l, i) => {
            t.append('tspan')
              .attr('x', 0)
              .attr('dy', i === 0 ? startDy : lineDy)
              .text(l)
          })
        })
      }

      renderLabels()

      // ---- Navigation (zoom into a petal) ----
      // The clicked node p becomes the centre disk; its descendants fill the
      // remaining radius ring by ring. Everything else collapses (invisible,
      // no pointer events) so clicks never hit hidden arcs.
      let focus = root
      const clicked = (event, p) => {
        if (event) event.stopPropagation()
        if (!p) return
        if (p !== root && !p.children) return
        hideTooltip()
        focus = p
        parentCircle.datum(p.parent || root)
        parentCircle.attr('fill', centerFillFor(p))

        const ring = radius / ((p.height || 0) + 1)
        centerRing = ring
        setCenterLabel(p)
        const span = Math.max(1e-9, p.x1 - p.x0)
        root.each(d => {
          let isDesc = false
          for (let a = d.parent; a; a = a.parent) {
            if (a === p) { isDesc = true; break }
          }
          const y0 = isDesc ? (d.depth - p.depth) * ring : 0
          d.target = {
            x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / span)) * 2 * Math.PI,
            x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / span)) * 2 * Math.PI,
            y0,
            y1: isDesc ? y0 + ring : 0,
          }
        })

        const t = g.transition().duration(600)
        labelG.style('opacity', 0)
        parentCircle.transition(t).attr('r', Math.max(1, ring - 1))

        path
          .attr('pointer-events', 'none')
          .transition(t)
          .attrTween('d', d => {
            const i = d3.interpolate(d.current, d.target)
            return tt => {
              d.current = i(tt)
              return arc(d.current)
            }
          })
          .attr('fill-opacity', d => (arcVisible(d.target) ? (d.children ? 0.7 : 0.55) : 0))

        t.on('end', () => {
          root.each(d => { d.current = d.target })
          path.attr('pointer-events', d => (arcVisible(d.current) ? 'auto' : 'none'))
          renderLabels()
          labelG.style('opacity', 1)
        })
      }

      // ---- Click vs drag ----
      // Mouse drag pans the scrollable chart area; a press that moved more
      // than DRAG_THRESHOLD px is a drag and never triggers navigation.
      const DRAG_THRESHOLD = 5
      const svgNode = svg.node()
      const findScroller = (el) => {
        for (let n = el?.parentElement; n; n = n.parentElement) {
          const cs = window.getComputedStyle(n)
          const ox = cs.overflowX
          const oy = cs.overflowY
          const canX = (ox === 'auto' || ox === 'scroll') && n.scrollWidth > n.clientWidth
          const canY = (oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight
          if (canX || canY) return n
        }
        return document.scrollingElement || document.documentElement
      }
      let drag = null
      let suppressClick = false
      const onPointerDown = (ev) => {
        if (ev.button !== 0) return
        drag = {
          x: ev.clientX,
          y: ev.clientY,
          scroller: findScroller(svgNode),
          moved: false,
          id: ev.pointerId,
        }
        drag.left = drag.scroller.scrollLeft
        drag.top = drag.scroller.scrollTop
        suppressClick = false
      }
      const onPointerMove = (ev) => {
        if (!drag || ev.pointerId !== drag.id) return
        const dx = ev.clientX - drag.x
        const dy = ev.clientY - drag.y
        if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        if (!drag.moved) {
          drag.moved = true
          hideTooltip()
          svg.style('cursor', 'grabbing')
          try { svgNode.setPointerCapture(ev.pointerId) } catch (_) { /* ignore */ }
        }
        drag.scroller.scrollLeft = drag.left - dx
        drag.scroller.scrollTop = drag.top - dy
        ev.preventDefault()
      }
      const onPointerUp = (ev) => {
        if (!drag || ev.pointerId !== drag.id) return
        if (drag.moved) suppressClick = true
        try { svgNode.releasePointerCapture(ev.pointerId) } catch (_) { /* ignore */ }
        drag = null
        svg.style('cursor', 'grab')
      }
      // Capture phase: swallow the click that ends a drag before d3 handlers.
      const onClickCapture = (ev) => {
        if (suppressClick) {
          suppressClick = false
          ev.stopPropagation()
          ev.preventDefault()
        }
      }
      const onDragStart = (ev) => ev.preventDefault()
      svgNode.addEventListener('pointerdown', onPointerDown)
      svgNode.addEventListener('pointermove', onPointerMove)
      svgNode.addEventListener('pointerup', onPointerUp)
      svgNode.addEventListener('pointercancel', onPointerUp)
      svgNode.addEventListener('click', onClickCapture, true)
      svgNode.addEventListener('dragstart', onDragStart)

      path.style('cursor', d => (d.children ? 'pointer' : 'grab'))
      // Petal with children -> zoom in. Leaf -> no-op (must not reset view).
      path.on('click', (event, d) => {
        event.stopPropagation()
        if (d.children) clicked(event, d)
      })
      parentCircle.style('cursor', 'pointer')
      // Centre -> one level up.
      parentCircle.on('click', (event) => {
        event.stopPropagation()
        if (focus !== root) clicked(event, focus.parent || root)
      })
      // Empty background -> back to the root view.
      svg.on('click', (event) => {
        if (event.target === svgNode && focus !== root) clicked(null, root)
      })
    } catch (err) {
      console.error('D3 sunburst render failed:', err)
      container.innerHTML = ''
      const errEl = document.createElement('div')
      errEl.className = 'd3-sunburst-error'
      errEl.textContent = `Ошибка отрисовки D3: ${err?.message || err}`
      container.appendChild(errEl)
    }

    return () => {
      hideTooltip()
    }
  }, [payload, onSizeChange, showFullTextProp, textAlongCircumferenceProp, dynamicFontSizeProp])

  useEffect(() => {
    return () => {
      if (tooltipRef.current) {
        tooltipRef.current.remove()
        tooltipRef.current = null
      }
    }
  }, [])

  return <div className="d3-sunburst-container" ref={containerRef} />
}

export default D3Sunburst
