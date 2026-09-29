import React, { useEffect, useRef } from 'react'
import * as d3 from 'd3'

const DEFAULT_FONT_SIZE = 16
const LINE_HEIGHT = 1.15
// Keep inner paddings minimal (Plotly-like tight layout).
const TEXT_PADDING = 2

function D3Sunburst({ payload, onSizeChange }) {
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
      const showFullText = Boolean(settings?.showFullText)
      const textAlongCircumference = Boolean(settings?.textAlongCircumference)
      const useGradient = settings?.useGradient !== false
      const colorMap = settings?.colorMap || {}

      const diameter = Math.min(maxSize, baseSize)
      const radius = diameter / 2

      // Do NOT call .sort(null): Array.sort(null) throws TypeError in modern JS
      // and left the chart area blank. Omitting sort preserves input/table order.
      const root = d3
        .hierarchy(tree)
        .sum(d => (d.children?.length ? 0 : (d.value || 0)))

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
        .attr('viewBox', `${-radius} ${-radius} ${diameter} ${diameter}`)

      const g = svg.append('g')

      const fontSize = DEFAULT_FONT_SIZE
      const context = document.createElement('canvas').getContext('2d')
      context.font = `${fontSize}px Arial, sans-serif`

      const ellipsize = (text, maxWidth) => {
        const s = String(text ?? '')
        if (maxWidth <= 0) return ''
        if (context.measureText(s).width <= maxWidth) return s
        const ellipsis = '…'
        if (context.measureText(ellipsis).width > maxWidth) return ''
        let lo = 0
        let hi = s.length
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2)
          const candidate = s.slice(0, mid) + ellipsis
          if (context.measureText(candidate).width <= maxWidth) lo = mid
          else hi = mid - 1
        }
        return s.slice(0, lo) + ellipsis
      }

      const truncateNoEllipsis = (text, maxWidth) => {
        const s = String(text ?? '')
        if (maxWidth <= 0) return ''
        if (context.measureText(s).width <= maxWidth) return s
        let lo = 0
        let hi = s.length
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2)
          const candidate = s.slice(0, mid)
          if (context.measureText(candidate).width <= maxWidth) lo = mid
          else hi = mid - 1
        }
        return s.slice(0, lo)
      }

      const computeLines = (node) => {
        const d = node.current
        const midR = (d.y0 + d.y1) / 2
        const arcLen = (d.x1 - d.x0) * midR
        const maxWidth = Math.max(0, arcLen - TEXT_PADDING * 2)
        const words = String(node.data?.name || '').split(/\s+/).filter(Boolean)
        if (!words.length) return []
        const lines = []
        let current = ''
        for (const w of words) {
          const test = current ? `${current} ${w}` : w
          if (!current || context.measureText(test).width <= maxWidth) current = test
          else {
            lines.push(current)
            current = w
          }
        }
        if (current) lines.push(current)

        // Even with showFullText, never paint text that cannot fit the sector —
        // full label stays available in the tooltip.
        const ringPx = Math.max(1, d.y1 - d.y0)
        const hardMaxLines = showFullText
          ? Math.max(2, Math.min(4, Math.floor((ringPx - TEXT_PADDING * 2) / (fontSize * LINE_HEIGHT))))
          : Math.max(1, Math.floor((ringPx - TEXT_PADDING * 2) / (fontSize * LINE_HEIGHT)))
        const overflow = lines.length > hardMaxLines
        const trimmed = lines.slice(0, hardMaxLines)

        const out = trimmed.map((l, i) => {
          const isLast = i === trimmed.length - 1
          if (!isLast) return truncateNoEllipsis(l, maxWidth)
          const needsEllipsis = overflow || context.measureText(l).width > maxWidth
          return needsEllipsis ? ellipsize(l, maxWidth) : truncateNoEllipsis(l, maxWidth)
        }).filter(Boolean)

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
      const labelVisible = (d) => {
        if (!arcVisible(d)) return false
        const midR = (d.y0 + d.y1) / 2
        const arcLen = (d.x1 - d.x0) * midR
        const thick = d.y1 - d.y0
        return arcLen >= fontSize * 0.8 && thick >= fontSize * 0.9
      }

      const centerRing = radius / (root.height + 1)
      const centerG = g.append('g').attr('class', 'd3-sunburst-center')
      const parentCircle = centerG
        .append('circle')
        .datum(root)
        .attr('r', centerRing * 0.95)
        .attr('fill', '#ffffff')
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
        .style('font-size', `${fontSize}px`)

      const setCenterLabel = (node) => {
        const text = String(node?.data?.name || '')
        centerText.selectAll('tspan').remove()
        centerText.text('')
        if (!text) return
        const words = text.split(/\s+/).filter(Boolean)
        const maxWidth = centerRing * 1.55
        let line = ''
        const lines = []
        for (const w of words) {
          const test = line ? `${line} ${w}` : w
          if (!line || context.measureText(test).width <= maxWidth) line = test
          else {
            lines.push(line)
            line = w
          }
          if (lines.length >= 3) break
        }
        if (line && lines.length < 3) lines.push(line)
        // Soft-truncate last line if we hit the cap
        const finalLines = lines.slice(0, 3).map((l, i, arr) => {
          if (i < arr.length - 1) return truncateNoEllipsis(l, maxWidth)
          const overflow = words.join(' ') !== arr.join(' ') || context.measureText(l).width > maxWidth
          return overflow ? ellipsize(l, maxWidth) : l
        })
        if (finalLines.length <= 1) {
          centerText.text(ellipsize(text, maxWidth))
          return
        }
        const lineDy = fontSize * 1.05
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
        const names = d.ancestors().map(a => a.data?.name).filter(Boolean).reverse()
        return names.join(' → ')
      }

      const showTooltip = (event, d) => {
        const tip = tooltipRef.current
        if (!tip) return
        tip.textContent = pathHoverText(d)
        tip.style.display = 'block'
        const pad = 12
        const x = Math.min(event.clientX + pad, window.innerWidth - tip.offsetWidth - pad)
        const y = Math.min(event.clientY + pad, window.innerHeight - tip.offsetHeight - pad)
        tip.style.left = `${Math.max(pad, x)}px`
        tip.style.top = `${Math.max(pad, y)}px`
      }

      const path = g
        .append('g')
        .selectAll('path')
        .data(nodes)
        .join('path')
        .attr('fill', d => {
          let a = d
          while (a.depth > 1) a = a.parent
          const base = colorMap[a.data.name] || color(a.data.name)
          if (!useGradient || d.depth <= 1) return base
          // Lighten nested rings so depth gradient is clearly visible
          return blend(base, Math.min(0.6, 0.22 * (d.depth - 1)))
        })
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
        .style('font-size', `${fontSize}px`)

      // Place label at the geometric center of the annular sector.
      const labelTransformTangential = (d) => {
        const midAngle = (d.x0 + d.x1) / 2
        const midR = (d.y0 + d.y1) / 2
        const deg = (midAngle * 180) / Math.PI
        // Flip text on the lower half so it stays upright/readable.
        const flip = midAngle > Math.PI
        return `rotate(${deg - 90}) translate(${midR},0) rotate(${flip ? 180 : 0})`
      }

      const defs = svg.append('defs')

      const labelAtMid = (d) => {
        // Explicit mid-angle / mid-radius (avoids inner-radius bias on wide slices).
        const midAngle = (d.x0 + d.x1) / 2
        const midR = (d.y0 + d.y1) / 2
        const cx = Math.sin(midAngle) * midR
        const cy = -Math.cos(midAngle) * midR
        return [cx, cy]
      }

      const renderLabels = () => {
        labelG.selectAll('*').remove()
        defs.selectAll('clipPath').remove()
        nodes.forEach((node) => {
          defs.append('clipPath')
            .attr('id', `d3-clip-${node._idx}`)
            .append('path')
            .attr('d', arc(node.current))
        })
        nodes.forEach((node) => {
          if (!labelVisible(node.current)) return
          const lines = computeLines(node)
          if (!lines.length) return

          const dCur = node.current
          let t
          if (textAlongCircumference) {
            t = labelG
              .append('text')
              .attr('transform', labelTransformTangential(dCur))
              .attr('dominant-baseline', 'middle')
          } else {
            const [cx, cy] = labelAtMid(dCur)
            t = labelG
              .append('text')
              .attr('transform', `translate(${cx},${cy})`)
              .attr('dominant-baseline', 'middle')
              .attr('clip-path', `url(#d3-clip-${node._idx})`)
          }

          t.attr('text-anchor', 'middle')
            .attr('fill', '#111')
            .style('paint-order', 'stroke')
            .style('stroke', '#fff')
            .style('stroke-width', 3)
            .style('stroke-linejoin', 'round')

          const lineDy = fontSize * LINE_HEIGHT
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
  }, [payload, onSizeChange])

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