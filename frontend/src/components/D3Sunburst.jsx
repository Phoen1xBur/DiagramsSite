import React, { useEffect, useRef } from 'react'
import * as d3 from 'd3'

const DEFAULT_FONT_SIZE = 16
const LINE_HEIGHT = 1.15
const TEXT_PADDING = 6

function D3Sunburst({ payload, onSizeChange }) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (!payload?.tree) return

    const container = containerRef.current
    if (!container) return
    container.innerHTML = ''

    const { tree, settings } = payload
    const palette = settings?.palette || []
    const baseSize = settings?.baseSize || 800
    const maxSize = settings?.maxSize || 5000
    const showFullText = Boolean(settings?.showFullText)
    const textAlongCircumference = Boolean(settings?.textAlongCircumference)

    const diameter = Math.min(maxSize, baseSize)
    const radius = diameter / 2

    const root = d3
      .hierarchy(tree)
      .sum(d => (d.children?.length ? 0 : (d.value || 0)))
      .sort((a, b) => b.value - a.value)

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

    const reverseGraphemes = (s) => {
      try {
        // eslint-disable-next-line no-undef
        if (typeof Intl !== 'undefined' && Intl.Segmenter) {
          // eslint-disable-next-line no-undef
          const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
          return Array.from(seg.segment(String(s ?? '')), x => x.segment).reverse().join('')
        }
      } catch {
        // ignore
      }
      return Array.from(String(s ?? '')).reverse().join('')
    }

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

      if (!showFullText) {
        const ringPx = Math.max(1, d.y1 - d.y0)
        const maxLines = Math.max(1, Math.floor((ringPx - TEXT_PADDING * 2) / (fontSize * LINE_HEIGHT)))
        const overflow = lines.length > maxLines
        const trimmed = lines.slice(0, maxLines)

        // Ensure earlier lines never end with ellipsis (ellipsis only once, on the last visible line).
        const out = trimmed.map((l, i) => {
          const isLast = i === trimmed.length - 1
          if (!isLast) return truncateNoEllipsis(l, maxWidth)
          const base = truncateNoEllipsis(l, maxWidth)
          return overflow ? ellipsize(base, maxWidth) : base
        }).filter(Boolean)

        return out
      }

      return lines.filter(Boolean)
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
      // Plotly-like thin separators: reduce padding between slices.
      .padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.00025))
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
      // Be more permissive than before: show labels widely like Plotly,
      // truncation will handle tight space.
      return arcLen >= fontSize * 0.8 && thick >= fontSize * 0.9
    }

    let focusNode = root

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
      const maxWidth = centerRing * 1.8
      let line = ''
      const lines = []
      for (const w of words) {
        const test = line ? `${line} ${w}` : w
        if (!line || context.measureText(test).width <= maxWidth) line = test
        else {
          lines.push(line)
          line = w
        }
        if (lines.length >= 2) break
      }
      if (line && lines.length < 2) lines.push(line)
      if (lines.length <= 1) {
        centerText.text(text)
        return
      }
      const lineDy = fontSize * 1.05
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

    const path = g
      .append('g')
      .selectAll('path')
      .data(nodes)
      .join('path')
      .attr('fill', d => {
        let a = d
        while (a.depth > 1) a = a.parent
        const base = color(a.data.name)
        return d.depth <= 1 ? base : blend(base, Math.min(0.55, 0.14 * (d.depth - 1)))
      })
      .attr('fill-opacity', d => (arcVisible(d.current) ? (d.children ? 0.65 : 0.45) : 0))
      .attr('stroke', '#fff')
      .attr('stroke-width', 0.35)
      .attr('d', d => arc(d.current))

    path.append('title').text(d => d.ancestors().map(a => a.data?.name).reverse().join(' → '))

    const labelG = g
      .append('g')
      .attr('class', 'd3-sunburst-text')
      .attr('pointer-events', 'none')
      .attr('text-anchor', 'middle')
      .style('user-select', 'none')
      .style('font-family', 'Arial, sans-serif')
      .style('font-size', `${fontSize}px`)

    const defs = svg.append('defs')

    const labelTransform = (d) => {
      const x = ((d.x0 + d.x1) / 2) * (180 / Math.PI)
      const y = (d.y0 + d.y1) / 2
      return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`
    }

    const arcPathForLabel = (d, r, flip) => {
      // Padding keeps text away from borders.
      const span = Math.max(0, d.x1 - d.x0)
      const pad = Math.min(0.03, span * 0.12)
      const x0 = d.x0 + pad
      const x1 = d.x1 - pad

      // Flip by BOTTOM half for textPath readability.
      const a0 = flip ? x1 : x0
      const a1 = flip ? x0 : x1

      const steps = Math.max(16, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 48)))
      let pathD = ''
      for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const a = a0 + (a1 - a0) * t
        // Match d3.arc's orientation: 0 at 12 o'clock.
        const ang = a - Math.PI / 2
        const px = Math.cos(ang) * r
        const py = Math.sin(ang) * r
        pathD += `${i === 0 ? 'M' : 'L'} ${px} ${py} `
      }
      return pathD.trim()
    }

    const renderLabels = () => {
      labelG.selectAll('*').remove()
      defs.selectAll('*').remove()
      nodes.forEach((node) => {
        if (!labelVisible(node.current)) return
        const lines = computeLines(node)
        if (!lines.length) return

        if (!textAlongCircumference) {
          // Plotly/Observable-style: text in sector centroid with rotation & flip.
          const t = labelG
            .append('text')
            .attr('transform', labelTransform(node.current))
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
          return
        }

        // Text along arc (curved): textPath. Keep upright, no upside-down.
        const dCur = node.current
        const mid = (dCur.x0 + dCur.x1) / 2
        // Flip on the BOTTOM half (>= 180°) to avoid upside-down text.
        // This matches Plotly/Observable logic (rotate 180 on bottom half).
        const flip = mid >= Math.PI
        const rMid = (dCur.y0 + dCur.y1) / 2

        const lineDy = fontSize * LINE_HEIGHT
        lines.forEach((l, i) => {
          const offset = (((lines.length - 1) / 2) - i) * lineDy
          const r = Math.max(0, rMid + offset)
          const id = `lbl-${node._idx}-${i}`
          defs.append('path').attr('id', id).attr('d', arcPathForLabel(dCur, r, flip))

          const textEl = labelG
            .append('text')
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('fill', '#111')
            .style('paint-order', 'stroke')
            .style('stroke', '#fff')
            .style('stroke-width', 3)
            .style('stroke-linejoin', 'round')

          textEl
            .append('textPath')
            .attr('href', `#${id}`)
            .attr('xlink:href', `#${id}`)
            .attr('startOffset', '50%')
            .style('text-anchor', 'middle')
            .text(flip ? reverseGraphemes(l) : l)
        })
      })
    }

    renderLabels()

    const clicked = (event, p) => {
      if (event) event.stopPropagation()
      focusNode = p
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
        .attr('fill-opacity', d => (arcVisible(d.target) ? (d.children ? 0.65 : 0.45) : 0))

      t.on('end', () => {
        renderLabels()
        labelG.style('opacity', 1)
      })
    }

    path.filter(d => d.children).style('cursor', 'pointer').on('click', clicked)
    parentCircle.on('click', (event) => clicked(event, parentCircle.datum()))
    svg.on('click', () => clicked(null, root))
  }, [payload, onSizeChange])

  return <div className="d3-sunburst-container" ref={containerRef} />
}

export default D3Sunburst
