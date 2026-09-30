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
      const { tree, settings } = payload
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
        .on('mousedown', () => svg.style('cursor', 'grabbing'))
        .on('mouseup', () => svg.style('cursor', 'grab'))
        .on('mouseleave', () => svg.style('cursor', 'grab'))

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

      const fontForNode = (node) => {
        if (!dynamicFontSize) return baseFont
        const d = node.current || node
        const ringPx = Math.max(1, d.y1 - d.y0)
        const midR = (d.y0 + d.y1) / 2
        const arcLen = Math.max(1, (d.x1 - d.x0) * midR)
        // Bigger rings / arcs → larger font, hard-capped.
        const byRing = ringPx * 0.42
        const byArc = arcLen * 0.18
        const raw = Math.min(byRing, byArc, FONT_SIZE_MAX)
        return Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, Math.round(raw || baseFont)))
      }

      const computeLines = (node, fontPx) => {
        const d = node.current
        const midR = (d.y0 + d.y1) / 2
        const arcLen = (d.x1 - d.x0) * midR
        const ringPx = Math.max(1, d.y1 - d.y0)
        // Cap width by both arc length and ring thickness so labels
        // cannot spill into neighboring rings (PDF captures it).
        // Full-text: use the full arc length so words wrap along the ring
        // instead of being force-truncated. Normal mode keeps the tight budget.
        const widthBudget = showFullText
          ? (textAlongCircumference ? arcLen : Math.max(arcLen * 0.98, ringPx * 2.2))
          : (textAlongCircumference
            ? Math.min(arcLen, ringPx * 2.4)
            : Math.min(arcLen * 0.95, ringPx * 1.6))
        const maxWidth = Math.max(0, widthBudget - TEXT_PADDING * 2)
        const rawName = String(node.data?.name || '').trim()
        if (!rawName || isBadLabel(rawName)) return []
        const words = rawName.split(/\s+/).filter(Boolean)
        if (!words.length) return []

        const lines = []
        let current = ''
        for (const w of words) {
          const test = current ? `${current} ${w}` : w
          if (!current || measureWith(fontPx, test) <= maxWidth) current = test
          else {
            lines.push(current)
            current = w
          }
        }
        if (current) lines.push(current)

        // In full-text mode keep every wrapped line. The label group is clipped
        // to the sector path below, so overflow is clipped rather than replaced
        // with an ellipsis. The normal mode keeps the compact two-line behavior.
        if (showFullText) return lines

        const hardMaxLines = Math.max(1, Math.min(2, Math.floor((ringPx - TEXT_PADDING * 2) / (fontPx * LINE_HEIGHT))))
        const overflow = lines.length > hardMaxLines
        const trimmed = lines.slice(0, Math.max(1, hardMaxLines))

        const out = trimmed.map((l, i) => {
          const isLast = i === trimmed.length - 1
          if (!isLast) return truncateNoEllipsis(l, maxWidth, fontPx)
          const needsEllipsis = overflow || measureWith(fontPx, l) > maxWidth
          return needsEllipsis ? ellipsize(l, maxWidth, fontPx) : truncateNoEllipsis(l, maxWidth, fontPx)
        }).filter(Boolean)

        // Fallback: if wrapping produced nothing but we have a name, force one ellipsized line.
        if (!out.length && rawName && maxWidth > 4) {
          const one = ellipsize(rawName, maxWidth, fontPx)
          if (one) return [one]
        }
        return out
      }

      const color = d3.scaleOrdinal(
        palette.length ? palette : d3.quantize(d3.interpolateRainbow, (root.children?.length || 1) + 1)
      )

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
      const labelVisible = (d, fontPx) => {
        if (!arcVisible(d)) return false
        const midR = (d.y0 + d.y1) / 2
        const arcLen = (d.x1 - d.x0) * midR
        const thick = d.y1 - d.y0
        // Lower thresholds so default (all toggles off) still shows labels on decent sectors.
        return arcLen >= fontPx * 0.55 && thick >= fontPx * 0.65
      }

      const centerRing = radius / (root.height + 1)
      const centerG = g.append('g').attr('class', 'd3-sunburst-center')
      const rootFill = (() => {
        if (root.data?.name && colorMap[root.data.name]) return colorMap[root.data.name]
        return '#ffffff'
      })()
      const parentCircle = centerG
        .append('circle')
        .datum(root)
        .attr('r', centerRing * 0.95)
        .attr('fill', rootFill === '#ffffff' ? '#ffffff' : blend(rootFill, 0.85))
        .attr('stroke', '#e0e0e0')
        .attr('stroke-width', 1)
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
        const fontPx = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, baseFont + (dynamicFontSize ? 2 : 0)))
        centerText.style('font-size', `${fontPx}px`)
        const words = text.split(/\s+/).filter(Boolean)
        const maxWidth = centerRing * 1.55
        let line = ''
        const lines = []
        for (const w of words) {
          const test = line ? `${line} ${w}` : w
          if (!line || measureWith(fontPx, test) <= maxWidth) line = test
          else {
            lines.push(line)
            line = w
          }
          if (!showFullText && lines.length >= 3) break
        }
        if (line && (showFullText || lines.length < 3)) lines.push(line)
        // Full-text: keep every wrapped line, never ellipsize the center label.
        const finalLines = (showFullText ? lines : lines.slice(0, 3)).map((l, i, arr) => {
          if (showFullText) return l
          if (i < arr.length - 1) return truncateNoEllipsis(l, maxWidth, fontPx)
          const overflow = words.join(' ') !== arr.join(' ') || measureWith(fontPx, l) > maxWidth
          return overflow ? ellipsize(l, maxWidth, fontPx) : l
        }).filter(Boolean)
        if (!finalLines.length) {
          centerText.text(showFullText ? text : ellipsize(text, maxWidth, fontPx))
          return
        }
        if (finalLines.length <= 1) {
          centerText.text(finalLines[0] || (showFullText ? text : ellipsize(text, maxWidth, fontPx)))
          return
        }
        const lineDy = fontPx * 1.05
        const startDy = -((finalLines.length - 1) / 2) * lineDy
        finalLines.forEach((l, i) => {
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

      // Tangential (along arc) — used when "Надпись по окружности" is on.
      const labelTransformTangential = (d) => {
        const midAngle = (d.x0 + d.x1) / 2
        const midR = (d.y0 + d.y1) / 2
        const deg = (midAngle * 180) / Math.PI
        const flip = midAngle > Math.PI
        return `rotate(${deg - 90}) translate(${midR},0) rotate(${flip ? 180 : 0})`
      }

      // Outward radial — preferred default (readable, less awkward than horizontal).
      const labelTransformRadial = (d) => {
        const midAngle = (d.x0 + d.x1) / 2
        const midR = (d.y0 + d.y1) / 2
        const deg = (midAngle * 180) / Math.PI
        // Flip on the left half so text is not upside-down.
        const flip = midAngle > Math.PI / 2 && midAngle < (3 * Math.PI) / 2
        return `rotate(${deg - 90}) translate(${midR},0) rotate(${flip ? 90 : -90})`
      }

      const defs = svg.append('defs')

      const renderLabels = () => {
        labelG.selectAll('*').remove()
        defs.selectAll('clipPath').remove()
        // Clip only in truncated mode. Full-text must keep the whole string
        // visible (wrap along arc or spill); clipPath mid-word cuts look like ellipsis.
        if (!showFullText) {
          nodes.forEach((node) => {
            defs.append('clipPath')
              .attr('id', `d3-clip-${node._idx}`)
              .append('path')
              .attr('d', arc(node.current))
          })
        }
        nodes.forEach((node) => {
          const fontPx = fontForNode(node)
          if (!labelVisible(node.current, fontPx)) return
          const lines = computeLines(node, fontPx)
          if (!lines.length) return

          const dCur = node.current
          const clipped = labelG.append('g')
          if (!showFullText) {
            clipped.attr('clip-path', `url(#d3-clip-${node._idx})`)
          }

          const t = clipped
            .append('text')
            .attr('transform', textAlongCircumference
              ? labelTransformTangential(dCur)
              : labelTransformRadial(dCur))
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

      const clicked = (event, p) => {
        if (event) event.stopPropagation()
        hideTooltip()
        parentCircle.datum(p.parent || root)
        setCenterLabel(p)

        const k = radius / (p.y1 - p.y0)
        root.each(d => {
          d.target = {
            x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
            x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
            y0: Math.max(0, (d.y0 - p.y0) * k),
            y1: Math.max(0, (d.y1 - p.y0) * k)
          }
        })

        const t = g.transition().duration(750)
        labelG.style('opacity', 0)

        path
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
          renderLabels()
          labelG.style('opacity', 1)
        })
      }

      path.filter(d => d.children).style('cursor', 'pointer').on('click', clicked)
      parentCircle.on('click', (event) => clicked(event, parentCircle.datum()))
      svg.on('click', () => clicked(null, root))
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
