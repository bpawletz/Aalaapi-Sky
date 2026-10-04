const FLIGHT_TOOLS = {
  'single': {
    id: 'single',
    label: '2D Grid',
    category: 'photogrammetry',
    icon: 'single',
    shortcut: '1',
    description: '2D Nadir Grid orthomosaic mapping pattern',
    propertyGroups: ['geometry', 'overlaps', 'altitude', 'speed', 'camera']
  },
  'double': {
    id: 'double',
    label: 'Double Grid',
    category: 'splats',
    icon: 'double',
    shortcut: '2',
    description: '3D Splat crosshatch double-grid pattern',
    propertyGroups: ['geometry', 'overlaps', 'altitude', 'speed', 'camera']
  },
  'target-splat': {
    id: 'target-splat',
    label: 'Target Splat',
    category: 'splats',
    icon: 'target-splat',
    shortcut: 'T',
    description: 'Target-Aware Oblique Grid with 3D Frustum Culling & Smart Trimming',
    propertyGroups: ['geometry', 'target-splat-geometry', 'overlaps', 'altitude', 'speed', 'camera']
  },
  'orbit': {
    id: 'orbit',
    label: 'Orbit',
    category: 'inspection',
    icon: 'orbit',
    shortcut: '3',
    description: '3D Object circular orbit pattern',
    propertyGroups: ['orbit-geometry', 'speed', 'altitude', 'camera']
  },
  'multi-orbit': {
    id: 'multi-orbit',
    label: 'Multi-Orbit',
    category: 'inspection',
    icon: 'multi-orbit',
    shortcut: '4',
    description: '3D Object multi-tiered orbit pattern',
    propertyGroups: ['multi-orbit-geometry', 'speed', 'altitude', 'camera']
  },
  'tower': {
    id: 'tower',
    label: 'Tower',
    category: 'inspection',
    icon: 'tower',
    shortcut: 'W',
    description: '3D Tower Structure Vertical/Horizontal Inspection Pattern',
    propertyGroups: ['tower-geometry', 'overlaps', 'altitude', 'speed', 'camera']
  },
  'photo-sphere': {
    id: 'photo-sphere',
    label: '360 Pano',
    category: 'panoramic',
    icon: 'photo-sphere',
    shortcut: 'S',
    description: '360° Equirectangular Photo Sphere panorama sequence (static position with yaw & gimbal pitch sequence)',
    propertyGroups: ['photo-sphere-geometry', 'altitude', 'speed']
  },
  'grid-orbit-combo': {
    id: 'grid-orbit-combo',
    label: 'Hybrid Combo',
    category: 'hybrid',
    icon: 'grid-orbit-combo',
    shortcut: '5',
    description: '2D Grid + Circular Orbit hybrid pattern',
    propertyGroups: ['geometry', 'overlaps', 'altitude', 'speed', 'camera']
  },
  'grid-multi-orbit-combo': {
    id: 'grid-multi-orbit-combo',
    label: 'Multi-Hybrid',
    category: 'hybrid',
    icon: 'grid-multi-orbit-combo',
    shortcut: '6',
    description: '2D Grid + Multi-Tiered Orbit hybrid pattern',
    propertyGroups: ['geometry', 'overlaps', 'altitude', 'speed', 'camera']
  },
  'road-following': {
    id: 'road-following',
    label: 'Road Follow',
    category: 'corridor',
    icon: 'road-following',
    shortcut: 'R',
    description: 'Road following with offset flight paths',
    propertyGroups: ['road-geometry', 'altitude', 'speed', 'camera']
  },
  'freeform': {
    id: 'freeform',
    label: 'Freeform',
    category: 'manual',
    icon: 'freeform',
    shortcut: 'F',
    description: 'Freeform flight plan with manual waypoints',
    propertyGroups: ['freeform-actions', 'altitude', 'speed', 'camera']
  },
  'exclusion-box': {
    id: 'exclusion-box',
    label: 'Exclusion (Box)',
    category: 'safety',
    icon: 'exclusion-box',
    shortcut: 'E',
    description: '3D Exclusion Zone rectangular boundary',
    propertyGroups: ['geometry', 'exclusion-altitude']
  },
  'exclusion-freeform': {
    id: 'exclusion-freeform',
    label: 'Exclusion (Poly)',
    category: 'safety',
    icon: 'exclusion-freeform',
    shortcut: 'P',
    description: '3D Exclusion Zone freeform polygon boundary',
    propertyGroups: ['exclusion-freeform-note', 'exclusion-altitude']
  },
  'boundary-polygon': {
    id: 'boundary-polygon',
    label: 'Boundary / Parcel',
    category: 'drawing',
    icon: 'boundary-polygon',
    shortcut: 'B',
    description: 'Drawing layer for property parcel perimeters and survey boundary envelopes',
    propertyGroups: ['boundary-properties']
  },
  'fiducial-markers': {
    id: 'fiducial-markers',
    label: 'Fiducial / GCPs',
    category: 'survey',
    icon: 'fiducial-markers',
    shortcut: 'M',
    description: 'Ground Control Points (GCPs), check points, and optical fiducial markers for photogrammetry',
    propertyGroups: ['fiducial-properties']
  }
};

// Global state variables
