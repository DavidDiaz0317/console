/**
 * EPP Flow Visual Components
 *
 * Extracted components for EPP routing visualization:
 * - Sparkline: Mini time-series chart
 * - PremiumNode: Glowing arc gauge nodes
 * - FlowParticle: Animated particles along paths
 * - HorseshoeNode: Alternative horseshoe-style nodes
 */

import { motion } from 'framer-motion'
import type { CSSProperties } from 'react'
import { getLoadColors, getHorseshoeColor } from './shared/colorUtils'

// Node colors
const NODE_COLOR_SOURCE = '#3b82f6'
const NODE_COLOR_EPP = '#f59e0b'
const NODE_COLOR_PREFILL = '#9333ea'
const NODE_COLOR_DECODE = '#22c55e'

// Node styling constants
const NODE_RADIUS = 6
const STROKE_WIDTH = 1.2
const TRACK_WIDTH = 0.8
const PARTICLE_RADIUS = 0.6

// Inline style constants
const EPPROUTING_DIV_STYLE_1: CSSProperties = { boxShadow: '0 0 6px #9333ea' }
const EPPROUTING_DIV_STYLE_2: CSSProperties = { boxShadow: '0 0 6px #22c55e' }
const EPPROUTING_DIV_STYLE_3: CSSProperties = { boxShadow: '0 0 4px rgba(147,51,234,0.4)' }
const EPPROUTING_DIV_STYLE_4: CSSProperties = { boxShadow: '0 0 4px rgba(34,197,94,0.4)' }

interface FlowNode {
  id: string
  label: string
  x: number
  y: number
  type: 'source' | 'router' | 'prefill' | 'decode'
  color: string
  load?: number
  isGhost?: boolean
}

interface FlowLink {
  source: string
  target: string
  value: number
  percentage: number
  type: 'prefill' | 'decode' | 'kv-transfer'
}

// Mini sparkline for time-series data
export function Sparkline({ data, color, width = 80, height = 24 }: { data: number[]; color: string; width?: number; height?: number }) {
  const validData = data.filter(v => Number.isFinite(v))
  if (validData.length < 2) return <div style={{ width, height }} className="bg-secondary/30 rounded" />

  const max = Math.max(...validData, 1)
  const min = Math.min(...validData, 0)
  const range = max - min || 1

  const points = validData.map((v, i) => {
    const x = (i / (validData.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x},${y}`
  }).join(' ')

  const areaPath = `M 0,${height} L ${points} L ${width},${height} Z`

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`sparkline-fill-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#sparkline-fill-${color.replace('#', '')})`} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        style={{ filter: `drop-shadow(0 0 2px ${color})` }}
      />
      <circle
        cx={width}
        cy={height - ((validData[validData.length - 1] - min) / range) * (height - 4) - 2}
        r="2"
        fill={color}
        style={{ filter: `drop-shadow(0 0 2px ${color})` }}
      />
    </svg>
  )
}

interface PremiumNodeProps {
  node: FlowNode
  uniqueId: string
  isSelected?: boolean
  onClick?: () => void
}

export function PremiumNode({ node, uniqueId, isSelected, onClick }: PremiumNodeProps) {
  const isGhost = node.isGhost || false
  const load = isGhost ? 0 : (node.load || 0)
  const loadColors = isGhost
    ? { start: '#475569', end: '#64748b', glow: '#475569' }
    : getLoadColors(load)

  const startAngle = -225
  const endAngle = 45
  const totalAngle = endAngle - startAngle
  const valueAngle = startAngle + (load / 100) * totalAngle

  const polarToCartesian = (angle: number, r: number) => {
    const rad = ((angle - 90) * Math.PI) / 180
    return { x: node.x + r * Math.cos(rad), y: node.y + r * Math.sin(rad) }
  }

  const createArc = (r: number, start: number, end: number) => {
    const s = polarToCartesian(end, r)
    const e = polarToCartesian(start, r)
    const large = end - start > 180 ? 1 : 0
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y}`
  }

  const filterIdGlow = `epp-glow-${uniqueId}-${node.id}`
  const gradientId = `epp-gradient-${uniqueId}-${node.id}`
  const innerGlowId = `epp-inner-glow-${uniqueId}-${node.id}`
  const centerGradientId = `epp-center-${uniqueId}-${node.id}`

  return (
    <motion.g
      className="cursor-pointer"
      onClick={onClick}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.1 }}
    >
      <defs>
        <filter id={filterIdGlow} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.35" result="blur" />
          <feFlood floodColor={loadColors.glow} floodOpacity="0.5" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={loadColors.start} />
          <stop offset="100%" stopColor={loadColors.end} />
        </linearGradient>

        <radialGradient id={innerGlowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={loadColors.glow} stopOpacity="0.2" />
          <stop offset="60%" stopColor={loadColors.glow} stopOpacity="0.08" />
          <stop offset="100%" stopColor={loadColors.glow} stopOpacity="0" />
        </radialGradient>

        <radialGradient id={centerGradientId} cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0f172a" />
        </radialGradient>
      </defs>

      {/* Inner glow circle */}
      <circle cx={node.x} cy={node.y} r={NODE_RADIUS + 2.5} fill={`url(#${innerGlowId})`} opacity="0.6" />

      {/* Background track (gray arc) */}
      <path
        d={createArc(NODE_RADIUS, startAngle, endAngle)}
        fill="none"
        stroke="#334155"
        strokeWidth={TRACK_WIDTH}
        opacity="0.3"
      />

      {/* Value arc (colored, glowing) */}
      {load > 0 && (
        <path
          d={createArc(NODE_RADIUS, startAngle, valueAngle)}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          filter={`url(#${filterIdGlow})`}
        />
      )}

      {/* Center circle with gradient */}
      <circle cx={node.x} cy={node.y} r={NODE_RADIUS - 2} fill={`url(#${centerGradientId})`} />

      {/* Selection ring */}
      {isSelected && (
        <circle
          cx={node.x}
          cy={node.y}
          r={NODE_RADIUS + 3}
          fill="none"
          stroke="#a855f7"
          strokeWidth="1.5"
          opacity="0.8"
        />
      )}
    </motion.g>
  )
}

interface FlowParticleProps {
  link: FlowLink
  delay: number
  nodes: FlowNode[]
  pathGenerator: (link: FlowLink) => string
}

export function FlowParticle({ link, delay, nodes: _nodes, pathGenerator: _pathGenerator }: FlowParticleProps) {
  return (
    <motion.circle
      r={PARTICLE_RADIUS}
      fill={link.type === 'prefill' ? NODE_COLOR_PREFILL : NODE_COLOR_DECODE}
      style={{ filter: 'drop-shadow(0 0 2px currentColor)' }}
      initial={{ offsetDistance: '0%' }}
      animate={{ offsetDistance: '100%' }}
      transition={{
        duration: 3,
        repeat: Infinity,
        ease: 'linear',
        delay
      }}
    >
      <animateMotion dur="3s" repeatCount="indefinite" begin={`${delay}s`}>
        <mpath xlinkHref={`#${link.source}-${link.target}`} />
      </animateMotion>
    </motion.circle>
  )
}

interface HorseshoeNodeProps {
  node: FlowNode
  uniqueId: string
  isSelected?: boolean
  onClick?: () => void
}

export function HorseshoeNode({ node, uniqueId, isSelected, onClick }: HorseshoeNodeProps) {
  const isGhost = node.isGhost || false
  const load = isGhost ? 0 : (node.load || 0)
  const color = isGhost ? '#475569' : getHorseshoeColor(load)

  const startAngle = 180
  const endAngle = 360
  const totalAngle = endAngle - startAngle
  const valueAngle = startAngle + (load / 100) * totalAngle

  const polarToCartesian = (angle: number, r: number) => {
    const rad = ((angle - 90) * Math.PI) / 180
    return { x: node.x + r * Math.cos(rad), y: node.y + r * Math.sin(rad) }
  }

  const createArc = (r: number, start: number, end: number) => {
    const s = polarToCartesian(end, r)
    const e = polarToCartesian(start, r)
    const large = end - start > 180 ? 1 : 0
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y}`
  }

  const filterId = `horseshoe-glow-${uniqueId}-${node.id}`

  return (
    <motion.g
      className="cursor-pointer"
      onClick={onClick}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.05 }}
    >
      <defs>
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.4" result="blur" />
          <feFlood floodColor={color} floodOpacity="0.6" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background track */}
      <path
        d={createArc(NODE_RADIUS, startAngle, endAngle)}
        fill="none"
        stroke="#334155"
        strokeWidth={TRACK_WIDTH}
        opacity="0.3"
      />

      {/* Value arc */}
      {load > 0 && (
        <path
          d={createArc(NODE_RADIUS, startAngle, valueAngle)}
          fill="none"
          stroke={color}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          filter={`url(#${filterId})`}
        />
      )}

      {/* Center circle */}
      <circle cx={node.x} cy={node.y} r={NODE_RADIUS - 2.5} fill={color} opacity="0.15" />
      <circle cx={node.x} cy={node.y} r={NODE_RADIUS - 3} fill={color} opacity="0.3" />

      {/* Selection ring */}
      {isSelected && (
        <circle
          cx={node.x}
          cy={node.y}
          r={NODE_RADIUS + 2.5}
          fill="none"
          stroke="#a855f7"
          strokeWidth="1.2"
          opacity="0.9"
        />
      )}
    </motion.g>
  )
}

export type { FlowNode, FlowLink, PremiumNodeProps, FlowParticleProps, HorseshoeNodeProps }
export { NODE_RADIUS, STROKE_WIDTH, TRACK_WIDTH, PARTICLE_RADIUS }
export { NODE_COLOR_SOURCE, NODE_COLOR_EPP, NODE_COLOR_PREFILL, NODE_COLOR_DECODE }
export { EPPROUTING_DIV_STYLE_1, EPPROUTING_DIV_STYLE_2, EPPROUTING_DIV_STYLE_3, EPPROUTING_DIV_STYLE_4 }
