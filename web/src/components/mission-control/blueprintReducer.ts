import type { MissionExport } from '../../lib/missions/types'
import type { ClusterHoverInfo } from './svg/ClusterZone'
import type { ProjectHoverInfo } from './svg/ProjectNode'
import type { MissionControlState } from './types'

export type InfoPanelData =
  | { kind: 'project'; info: ProjectHoverInfo }
  | { kind: 'cluster'; info: ClusterHoverInfo }
  | { kind: 'deployMode'; mode: 'phased' | 'yolo'; phases: MissionControlState['phases'] }

export interface BlueprintState {
  infoPanel: InfoPanelData | null
  stickyPanel: InfoPanelData | null
  dragProject: { name: string; fromCluster: string } | null
  dropTarget: string | null
  previewMission: MissionExport | null
  previewRaw: boolean
  previewLoading: boolean
  infoPanelWidth: number
  infoPanelCollapsed: boolean
  zoom: number
  animationsEnabled: boolean
  labelsVisible: boolean
  hoveredEdge: { from: string; to: string } | null
  hoveredProjectKey: string | null
}

export type BlueprintAction =
  | { type: 'SET_INFO_PANEL'; panel: InfoPanelData | null }
  | { type: 'SET_STICKY_PANEL'; panel: InfoPanelData | null }
  | { type: 'HOVER_PROJECT'; panel: InfoPanelData; sticky: InfoPanelData }
  | { type: 'HOVER_CLUSTER'; panel: InfoPanelData; sticky: InfoPanelData }
  | { type: 'CLEAR_HOVER' }
  | { type: 'START_DRAG'; name: string; fromCluster: string }
  | { type: 'SET_DROP_TARGET'; target: string | null }
  | { type: 'END_DRAG' }
  | { type: 'DROP_ON_CLUSTER'; clusterName: string }
  | { type: 'SET_PREVIEW_MISSION'; mission: MissionExport | null }
  | { type: 'SET_PREVIEW_RAW'; raw: boolean }
  | { type: 'TOGGLE_PREVIEW_RAW' }
  | { type: 'SET_PREVIEW_LOADING'; loading: boolean }
  | { type: 'CLOSE_PREVIEW' }
  | { type: 'SET_INFO_PANEL_WIDTH'; width: number }
  | { type: 'TOGGLE_INFO_PANEL' }
  | { type: 'ZOOM_IN' }
  | { type: 'ZOOM_OUT' }
  | { type: 'ZOOM_RESET' }
  | { type: 'TOGGLE_ANIMATIONS' }
  | { type: 'TOGGLE_LABELS' }
  | { type: 'SET_HOVERED_EDGE'; edge: { from: string; to: string } | null }
  | { type: 'SET_HOVERED_PROJECT_KEY'; key: string | null }

export const INFO_PANEL_MIN = 280
export const INFO_PANEL_MAX = 600
export const INFO_PANEL_DEFAULT = 416
export const INFO_PANEL_LS_KEY = 'mission-control-info-panel-width'
export const ZOOM_MIN = 0.3
export const ZOOM_MAX = 3
export const ZOOM_STEP = 0.2

export function createInitialBlueprintState(mcState: MissionControlState): BlueprintState {
  let infoPanelWidth = INFO_PANEL_DEFAULT

  try {
    const stored = localStorage.getItem(INFO_PANEL_LS_KEY)
    if (stored) {
      const parsed = Number(stored)
      if (parsed >= INFO_PANEL_MIN && parsed <= INFO_PANEL_MAX) {
        infoPanelWidth = parsed
      }
    }
  } catch {
    // ignore localStorage access errors
  }

  return {
    infoPanel: null,
    stickyPanel: { kind: 'deployMode', mode: mcState.deployMode, phases: mcState.phases },
    dragProject: null,
    dropTarget: null,
    previewMission: null,
    previewRaw: false,
    previewLoading: false,
    infoPanelWidth,
    infoPanelCollapsed: false,
    zoom: 1,
    animationsEnabled: true,
    labelsVisible: true,
    hoveredEdge: null,
    hoveredProjectKey: null,
  }
}

export function blueprintReducer(state: BlueprintState, action: BlueprintAction): BlueprintState {
  switch (action.type) {
    case 'SET_INFO_PANEL':
      return { ...state, infoPanel: action.panel }
    case 'SET_STICKY_PANEL':
      return { ...state, stickyPanel: action.panel }
    case 'HOVER_PROJECT':
      return { ...state, infoPanel: action.panel, stickyPanel: action.sticky }
    case 'HOVER_CLUSTER':
      if (state.dragProject) return state
      return { ...state, infoPanel: action.panel, stickyPanel: action.sticky }
    case 'CLEAR_HOVER':
      return { ...state, infoPanel: null }
    case 'START_DRAG':
      return { ...state, dragProject: { name: action.name, fromCluster: action.fromCluster } }
    case 'SET_DROP_TARGET':
      return { ...state, dropTarget: action.target }
    case 'END_DRAG':
    case 'DROP_ON_CLUSTER':
      return { ...state, dragProject: null, dropTarget: null }
    case 'SET_PREVIEW_MISSION':
      return { ...state, previewMission: action.mission }
    case 'SET_PREVIEW_RAW':
      return { ...state, previewRaw: action.raw }
    case 'TOGGLE_PREVIEW_RAW':
      return { ...state, previewRaw: !state.previewRaw }
    case 'SET_PREVIEW_LOADING':
      return { ...state, previewLoading: action.loading }
    case 'CLOSE_PREVIEW':
      return { ...state, previewMission: null, previewRaw: false }
    case 'SET_INFO_PANEL_WIDTH': {
      const width = Math.min(INFO_PANEL_MAX, Math.max(INFO_PANEL_MIN, action.width))
      return { ...state, infoPanelWidth: width }
    }
    case 'TOGGLE_INFO_PANEL':
      return { ...state, infoPanelCollapsed: !state.infoPanelCollapsed }
    case 'ZOOM_IN':
      return { ...state, zoom: Math.min(state.zoom + ZOOM_STEP, ZOOM_MAX) }
    case 'ZOOM_OUT':
      return { ...state, zoom: Math.max(state.zoom - ZOOM_STEP, ZOOM_MIN) }
    case 'ZOOM_RESET':
      return { ...state, zoom: 1 }
    case 'TOGGLE_ANIMATIONS':
      return { ...state, animationsEnabled: !state.animationsEnabled }
    case 'TOGGLE_LABELS':
      return { ...state, labelsVisible: !state.labelsVisible }
    case 'SET_HOVERED_EDGE':
      return { ...state, hoveredEdge: action.edge }
    case 'SET_HOVERED_PROJECT_KEY':
      return { ...state, hoveredProjectKey: action.key }
    default:
      return state
  }
}
