import {
  BlendingState,
  BoundingSphere,
  Buffer,
  BufferUsage,
  Cartesian3,
  Color,
  combine,
  ComponentDatatype,
  Context,
  CullFace,
  defaultValue,
  defined,
  destroyObject,
  DeveloperError,
  DrawCommand,
  EllipsoidGeometry,
  EllipsoidOutlineGeometry,
  FrameState,
  JulianDate,
  Material,
  Matrix3,
  Matrix4,
  Pass,
  PrimitiveType,
  RenderState,
  SceneMode,
  ShaderProgram,
  ShaderSource,
  VertexArray,
  VertexFormat,
} from 'cesium';

import { removePrimitive } from '../util/remove-primitive';
import {
  RectangularSensor,
  RectangularSensorFS,
  RectangularSensorScanPlaneFS,
  RectangularSensorVS,
} from './shaders';

// var defineProperties = Object.defineProperties;

// function assignSpherical(index, array, clock, cone) {
//   var spherical = array[index];
//   if (!defined(spherical)) {
//     spherical = new Spherical();
//     array[index] = spherical;
//   }
//   spherical.clock = clock;
//   spherical.cone = cone;
//   spherical.magnitude = 1.0;
// }

// function updateDirections(rectangularSensor) {
//   var directions = rectangularSensor._customSensor.directions;

//   // At 90 degrees the sensor is completely open, and tan() goes to infinity.
//   var tanX = Math.tan(
//     Math.min(rectangularSensor._xHalfAngle, CesiumMath.toRadians(89.0))
//   );
//   var tanY = Math.tan(
//     Math.min(rectangularSensor._yHalfAngle, CesiumMath.toRadians(89.0))
//   );
//   var theta = Math.atan(tanX / tanY);
//   var cone = Math.atan(Math.sqrt(tanX * tanX + tanY * tanY));

//   assignSpherical(0, directions, theta, cone);
//   assignSpherical(1, directions, CesiumMath.toRadians(180.0) - theta, cone);
//   assignSpherical(2, directions, CesiumMath.toRadians(180.0) + theta, cone);
//   assignSpherical(3, directions, -theta, cone);

//   directions.length = 4;
//   rectangularSensor._customSensor.directions = directions;
// }

const attributeLocations = {
  position: 0,
  normal: 1,
};

export function RectangularPyramidSensorVolume(this: any, options?) {
  const self = this;

  options = defaultValue(options, {});

  /**
   * Whether the sensor should be rendered
   */
  this.show = defaultValue(options?.show, true);

  /**
   * The number of radial slices to partition the domes ellipsoid into
   */
  this.slice = defaultValue(options?.slice, 32);

  /**
   * The model matrix for the sensor
   */
  this.modelMatrix = Matrix4.clone(
    options?.modelMatrix ?? new Matrix4(),
    new Matrix4()
  );
  this._modelMatrix = new Matrix4();
  this._computedModelMatrix = new Matrix4();
  this._computedScanPlaneModelMatrix = new Matrix4();

  /**
   * The radius of the sensor
   */
  this.radius = defaultValue(options?.radius, Number.POSITIVE_INFINITY);
  this._radius = undefined;

  /**
   * Half the angle of the sensors horizontal field of view
   */
  this.xHalfAngle = defaultValue(options?.xHalfAngle, 0);
  this._xHalfAngle = undefined;

  /**
   * Half the angle of the sensors vertical field of view
   */
  this.yHalfAngle = defaultValue(options?.yHalfAngle, 0);
  this._yHalfAngle = undefined;

  /**
   * The color of the line
   */
  this.lineColor = defaultValue(options?.lineColor, Color.WHITE);

  /**
   * Whether to display the sector lines
   */
  this.showSectorLines = defaultValue(options?.showSectorLines, true);

  /**
   * Whether to display the sector segment lines
   */
  this.showSectorSegmentLines = defaultValue(
    options?.showSectorSegmentLines,
    true
  );

  /**
   * Whether to show the outer planes of the sensor
   */
  this.showLateralSurfaces = defaultValue(options?.showLateralSurfaces, true);

  /**
   * @type {Material}
   */
  this.material = defined(options?.material)
    ? options?.material
    : Material.fromType(Material.ColorType);
  this._material = undefined;
  this._translucent = undefined;

  this.lateralSurfaceMaterial = defined(options?.lateralSurfaceMaterial)
    ? options?.lateralSurfaceMaterial
    : Material.fromType(Material.ColorType);
  this._lateralSurfaceMaterial = undefined;
  this._lateralSurfaceTranslucent = undefined;

  this.showDomeSurfaces = defaultValue(options?.showDomeSurfaces, true);

  this.domeSurfaceMaterial = defined(options?.domeSurfaceMaterial)
    ? options?.domeSurfaceMaterial
    : Material.fromType(Material.ColorType);
  this._domeSurfaceMaterial = undefined;

  this.showDomeLines = defaultValue(options?.showDomeLines, true);

  this.showIntersection = defaultValue(options?.showIntersection, true);

  this.intersectionColor = defaultValue(
    options?.intersectionColor,
    Color.WHITE
  );

  this.intersectionWidth = defaultValue(options?.intersectionWidth, 5.0);

  this.showThroughEllipsoid = defaultValue(
    options?.showThroughEllipsoid,
    false
  );
  this._showThroughEllipsoid = undefined;

  this.showScanPlane = defaultValue(options?.showScanPlane, true);

  this.scanPlaneColor = defaultValue(options?.scanPlaneColor, Color.WHITE);

  this.scanPlaneMode = defaultValue(options?.scanPlaneMode, 'horizontal');

  this.scanPlaneRate = defaultValue(options?.scanPlaneRate, 10);

  this._scanPlaneXHalfAngle = 0;
  this._scanPlaneYHalfAngle = 0;

  this._time = JulianDate.now();

  this._boundingSphere = new BoundingSphere();
  this._boundingSphereWC = new BoundingSphere();

  this._sectorFrontCommand = new DrawCommand({
    owner: this,
    primitiveType: PrimitiveType.TRIANGLES,
    boundingVolume: this._boundingSphereWC,
  });
  this._sectorBackCommand = new DrawCommand({
    owner: this,
    primitiveType: PrimitiveType.TRIANGLES,
    boundingVolume: this._boundingSphereWC,
  });
  this._sectorVA = undefined;

  this._sectorLineCommand = new DrawCommand({
    owner: this,
    primitiveType: PrimitiveType.LINES,
    boundingVolume: this._boundingSphereWC,
  });
  this._sectorLineVA = undefined;

  this._sectorSegmentLineCommand = new DrawCommand({
    owner: this,
    primitiveType: PrimitiveType.LINES,
    boundingVolume: this._boundingSphereWC,
  });
  this._sectorSegmentLineVA = undefined;

  this._domeFrontCommand = new DrawCommand({
    owner: this,
    primitiveType: PrimitiveType.TRIANGLES,
    boundingVolume: this._boundingSphereWC,
  });
  this._domeBackCommand = new DrawCommand({
    owner: this,
    primitiveType: PrimitiveType.TRIANGLES,
    boundingVolume: this._boundingSphereWC,
  });
  this._domeVA = undefined;

  this._domeLineCommand = new DrawCommand({
    owner: this,
    primitiveType: PrimitiveType.LINES,
    boundingVolume: this._boundingSphereWC,
  });
  this._domeLineVA = undefined;

  this._scanPlaneFrontCommand = new DrawCommand({
    owner: this,
    primitiveType: PrimitiveType.TRIANGLES,
    boundingVolume: this._boundingSphereWC,
  });
  this._scanPlaneBackCommand = new DrawCommand({
    owner: this,
    primitiveType: PrimitiveType.TRIANGLES,
    boundingVolume: this._boundingSphereWC,
  });

  this._scanRadialCommand = undefined;

  this._colorCommands = [];

  this._frontFaceRS = undefined;
  this._backFaceRS = undefined;
  this._shaderProgram = undefined;

  this._uniforms = {
    u_type: function () {
      return 0;
    },
    u_xHalfAngle: function () {
      return self.xHalfAngle;
    },
    u_yHalfAngle: function () {
      return self.yHalfAngle;
    },
    u_radius: function () {
      return self.radius;
    },
    u_showThroughEllipsoid: function () {
      return self.showThroughEllipsoid;
    },
    u_showIntersection: function () {
      return self.showIntersection;
    },
    u_intersectionColor: function () {
      return self.intersectionColor;
    },
    u_intersectionWidth: function () {
      return self.intersectionWidth;
    },
    u_normalDirection: function () {
      return 1.0;
    },
    u_lineColor: function () {
      return self.lineColor;
    },
  };

  this._scanPlaneUniforms = {
    u_xHalfAngle: function () {
      return self._scanePlaneXHalfAngle;
    },
    u_yHalfAngle: function () {
      return self._scanePlaneYHalfAngle;
    },
    u_radius: function () {
      return self.radius;
    },
    u_color: function () {
      return self.scanPlaneColor;
    },
    u_showThroughEllipsoid: function () {
      return self.showThroughEllipsoid;
    },
    u_showIntersection: function () {
      return self.showIntersection;
    },
    u_intersectionColor: function () {
      return self.intersectionColor;
    },
    u_intersectionWidth: function () {
      return self.intersectionWidth;
    },
    u_normalDirection: function () {
      return 1.0;
    },
    u_lineColor: function () {
      return self.lineColor;
    },
  };
}

let matrix3Scratch = new Matrix3();
let nScratch = new Cartesian3();

RectangularPyramidSensorVolume.prototype.update = function (
  frameState: FrameState
) {
  const mode = frameState.mode;
  if (!this.show || mode !== SceneMode.SCENE3D) {
    return;
  }
  let createVS = false;
  let createRS = false;
  let createSP = false;

  const xHalfAngle = this.xHalfAngle;
  const yHalfAngle = this.yHalfAngle;

  if (xHalfAngle < 0.0 || yHalfAngle < 0.0) {
    throw new DeveloperError(
      'halfAngle must be greater than or equal to zero.'
    );
  }
  if (xHalfAngle == 0.0 || yHalfAngle == 0.0) {
    return;
  }
  if (this._xHalfAngle !== xHalfAngle || this._yHalfAngle !== yHalfAngle) {
    this._xHalfAngle = xHalfAngle;
    this._yHalfAngle = yHalfAngle;
    createVS = true;
  }

  const radius = this.radius;
  if (radius < 0.0) {
    throw new DeveloperError(
      'this.radius must be greater than or equal to zero.'
    );
  }
  let radiusChanged = false;
  if (this._radius !== radius) {
    radiusChanged = true;
    this._radius = radius;
    this._boundingSphere = new BoundingSphere(Cartesian3.ZERO, this.radius);
  }

  const modelMatrixChanged = !Matrix4.equals(
    this.modelMatrix,
    this._modelMatrix
  );
  if (modelMatrixChanged || radiusChanged) {
    Matrix4.clone(this.modelMatrix, this._modelMatrix);
    Matrix4.multiplyByUniformScale(
      this.modelMatrix,
      this.radius,
      this._computedModelMatrix
    );
    BoundingSphere.transform(
      this._boundingSphere,
      this.modelMatrix,
      this._boundingSphereWC
    );
  }

  const showThroughEllipsoid = this.showThroughEllipsoid;
  if (this._showThroughEllipsoid !== this.showThroughEllipsoid) {
    this._showThroughEllipsoid = showThroughEllipsoid;
    createRS = true;
  }

  const material = this.lateralSurfaceMaterial;
  if (this._lateralSurfaceMaterial !== material) {
    this._lateralSurfaceMaterial = material;
    createRS = true;
    createSP = true;
  }
  const translucent = material.isTranslucent();
  if (this._translucent !== translucent) {
    this._translucent = translucent;
    createRS = true;
  }

  if (this.showScanPlane) {
    const time = frameState.time;
    const timeDiff = JulianDate.secondsDifference(time, this._time);
    if (timeDiff < 0) {
      this._time = JulianDate.clone(time, this._time);
    }
    const percentage = Math.max(
      (timeDiff % this.scanPlaneRate) / this.scanPlaneRate,
      0
    );
    let angle;

    if (this.scanPlaneMode == 'horizontal') {
      angle = 2 * yHalfAngle * percentage - yHalfAngle;
      const cosYHalfAngle = Math.cos(angle);
      const tanXHalfAngle = Math.tan(xHalfAngle);

      const maxX = Math.atan(cosYHalfAngle * tanXHalfAngle);
      this._scanePlaneXHalfAngle = maxX;
      this._scanePlaneYHalfAngle = angle;
      Matrix3.fromRotationX(this._scanePlaneYHalfAngle, matrix3Scratch);
    } else {
      angle = 2 * xHalfAngle * percentage - xHalfAngle;
      const tanYHalfAngle = Math.tan(yHalfAngle);
      const cosXHalfAngle = Math.cos(angle);

      const maxY = Math.atan(cosXHalfAngle * tanYHalfAngle);
      this._scanePlaneXHalfAngle = angle;
      this._scanePlaneYHalfAngle = maxY;
      Matrix3.fromRotationY(this._scanePlaneXHalfAngle, matrix3Scratch);
    }

    Matrix4.multiplyByMatrix3(
      this.modelMatrix,
      matrix3Scratch,
      this._computedScanPlaneModelMatrix
    );
    Matrix4.multiplyByUniformScale(
      this._computedScanPlaneModelMatrix,
      this.radius,
      this._computedScanPlaneModelMatrix
    );
  }

  if (createVS) {
    createVertexArray(this, frameState);
  }
  if (createRS) {
    createRenderState(this, showThroughEllipsoid, translucent);
  }
  if (createSP) {
    createShaderProgram(this, frameState, material);
  }
  if (createRS || createSP) {
    createCommands(this, translucent);
  }

  const commandList = frameState.commandList;
  const passes = frameState.passes;
  const colorCommands = this._colorCommands;
  if (passes.render) {
    for (let i = 0, len = colorCommands.length; i < len; i++) {
      var colorCommand = colorCommands[i];
      commandList.push(colorCommand);
    }
  }
};

//region -- VertexArray --

/**
 * Calculate the surface and unit sector position of the surface
 * @param primitive
 */
function computeUnitPosition(
  primitive: any,
  xHalfAngle: number,
  yHalfAngle: number
) {
  const slice = primitive.slice ?? 0;

  // angle from center
  const cosYHalfAngle = Math.cos(yHalfAngle);
  const tanYHalfAngle = Math.tan(yHalfAngle);
  const cosXHalfAngle = Math.cos(xHalfAngle);
  const tanXHalfAngle = Math.tan(xHalfAngle);

  const maxY = Math.atan(cosXHalfAngle * tanYHalfAngle);
  const maxX = Math.atan(cosYHalfAngle * tanXHalfAngle);

  // unit circle in zy plane
  let zy: Cartesian3[] = [];
  for (let i = 0; i < slice; i++) {
    const phi = (2 * maxY * i) / (slice - 1) - maxY;
    zy.push(new Cartesian3(0, Math.sin(phi), Math.cos(phi)));
  }
  // unit circle in zx plane
  let zx: Cartesian3[] = [];
  for (let i = 0; i < slice; i++) {
    const phi = (2 * maxX * i) / (slice - 1) - maxX;
    zx.push(new Cartesian3(Math.sin(phi), 0, Math.cos(phi)));
  }

  return {
    zy,
    zx,
  };
}

/**
 * Calcuate the sector positions
 * @param unitPosition
 * @returns {Array}
 */
function computeSectorPositions(
  primitive: any,
  unitPosition: any
): Cartesian3[][] {
  const xHalfAngle = primitive.xHalfAngle ?? 0;
  const yHalfAngle = primitive.yHalfAngle ?? 0;
  const { zy, zx } = unitPosition;
  const positions: Cartesian3[][] = [];

  // The zy surface rotates xHalfAngle counterclockwise along the y axis
  const m1 = Matrix3.fromRotationY(xHalfAngle, matrix3Scratch);
  positions.push(
    zy.map(function (p) {
      return Matrix3.multiplyByVector(m1, p, new Cartesian3());
    })
  );
  // The zx face rotates yHalfAngle clockwise along the x-axis
  const m2 = Matrix3.fromRotationX(-yHalfAngle, matrix3Scratch);
  positions.push(
    zx
      .map(function (p) {
        return Matrix3.multiplyByVector(m2, p, new Cartesian3());
      })
      .reverse()
  );
  // The zy surface rotates xHalfAngle clockwise along the y axis
  const m3 = Matrix3.fromRotationY(-xHalfAngle, matrix3Scratch);
  positions.push(
    zy
      .map(function (p) {
        return Matrix3.multiplyByVector(m3, p, new Cartesian3());
      })
      .reverse()
  );
  // The zx face rotates yHalfAngle counterclockwise along the x-axis
  const m4 = Matrix3.fromRotationX(yHalfAngle, matrix3Scratch);
  positions.push(
    zx.map(function (p) {
      return Matrix3.multiplyByVector(m4, p, new Cartesian3());
    })
  );
  return positions;
}

/**
 * Create the vertices on the radar fan
 * @param context
 * @param positions
 * @returns {*}
 */
function createSectorVertexArray(context: Context, positions: Cartesian3[][]) {
  const planeLength =
    Array.prototype.concat.apply([], positions).length - positions.length;
  const vertices = new Float32Array(2 * 3 * 3 * planeLength);

  let k = 0;
  for (let i = 0, len = positions.length; i < len; i++) {
    const planePositions = positions[i];
    const n = Cartesian3.normalize(
      Cartesian3.cross(
        planePositions[0],
        planePositions[planePositions.length - 1],
        nScratch
      ),
      nScratch
    );
    for (
      let j = 0, planeLength = planePositions.length - 1;
      j < planeLength;
      j++
    ) {
      vertices[k++] = 0.0;
      vertices[k++] = 0.0;
      vertices[k++] = 0.0;
      vertices[k++] = -n.x;
      vertices[k++] = -n.y;
      vertices[k++] = -n.z;

      vertices[k++] = planePositions[j].x;
      vertices[k++] = planePositions[j].y;
      vertices[k++] = planePositions[j].z;
      vertices[k++] = -n.x;
      vertices[k++] = -n.y;
      vertices[k++] = -n.z;

      vertices[k++] = planePositions[j + 1].x;
      vertices[k++] = planePositions[j + 1].y;
      vertices[k++] = planePositions[j + 1].z;
      vertices[k++] = -n.x;
      vertices[k++] = -n.y;
      vertices[k++] = -n.z;
    }
  }

  const vertexBuffer = Buffer.createVertexBuffer({
    context: context,
    typedArray: vertices,
    usage: BufferUsage.STATIC_DRAW,
  });

  const stride = 2 * 3 * Float32Array.BYTES_PER_ELEMENT;

  const attributes = [
    {
      index: attributeLocations.position,
      vertexBuffer: vertexBuffer,
      componentsPerAttribute: 3,
      componentDatatype: ComponentDatatype.FLOAT,
      offsetInBytes: 0,
      strideInBytes: stride,
    },
    {
      index: attributeLocations.normal,
      vertexBuffer: vertexBuffer,
      componentsPerAttribute: 3,
      componentDatatype: ComponentDatatype.FLOAT,
      offsetInBytes: 3 * Float32Array.BYTES_PER_ELEMENT,
      strideInBytes: stride,
    },
  ];

  return new VertexArray({
    context: context,
    attributes: attributes,
  });
}

/**
 * Create the vertices of the fan edge
 * @param context
 * @param positions
 * @returns {*}
 */
function createSectorLineVertexArray(
  context: Context,
  positions: Cartesian3[][]
) {
  const planeLength = positions.length;
  const vertices = new Float32Array(3 * 3 * planeLength);

  let k = 0;
  for (let i = 0, len = positions.length; i < len; i++) {
    const planePositions = positions[i];
    vertices[k++] = 0.0;
    vertices[k++] = 0.0;
    vertices[k++] = 0.0;

    vertices[k++] = planePositions[0].x;
    vertices[k++] = planePositions[0].y;
    vertices[k++] = planePositions[0].z;
  }

  const vertexBuffer = Buffer.createVertexBuffer({
    context: context,
    typedArray: vertices,
    usage: BufferUsage.STATIC_DRAW,
  });

  const stride = 3 * Float32Array.BYTES_PER_ELEMENT;

  const attributes = [
    {
      index: attributeLocations.position,
      vertexBuffer: vertexBuffer,
      componentsPerAttribute: 3,
      componentDatatype: ComponentDatatype.FLOAT,
      offsetInBytes: 0,
      strideInBytes: stride,
    },
  ];

  return new VertexArray({
    context: context,
    attributes: attributes,
  });
}

/**
 * Create the vertices of the domes lines
 * @param context
 * @param positions
 * @returns {*}
 */
function createSectorSegmentLineVertexArray(
  context: Context,
  positions: Cartesian3[][]
) {
  const planeLength =
    Array.prototype.concat.apply([], positions).length - positions.length;
  const vertices = new Float32Array(3 * 3 * planeLength);

  let k = 0;
  for (let i = 0, len = positions.length; i < len; i++) {
    const planePositions = positions[i];

    for (
      let j = 0, planeLength = planePositions.length - 1;
      j < planeLength;
      j++
    ) {
      vertices[k++] = planePositions[j].x;
      vertices[k++] = planePositions[j].y;
      vertices[k++] = planePositions[j].z;

      vertices[k++] = planePositions[j + 1].x;
      vertices[k++] = planePositions[j + 1].y;
      vertices[k++] = planePositions[j + 1].z;
    }
  }

  const vertexBuffer = Buffer.createVertexBuffer({
    context: context,
    typedArray: vertices,
    usage: BufferUsage.STATIC_DRAW,
  });

  const stride = 3 * Float32Array.BYTES_PER_ELEMENT;

  const attributes = [
    {
      index: attributeLocations.position,
      vertexBuffer: vertexBuffer,
      componentsPerAttribute: 3,
      componentDatatype: ComponentDatatype.FLOAT,
      offsetInBytes: 0,
      strideInBytes: stride,
    },
  ];

  return new VertexArray({
    context: context,
    attributes: attributes,
  });
}

/**
 * Create the vertices for the dome
 * @param context
 */
function createDomeVertexArray(context: Context) {
  const geometry = EllipsoidGeometry.createGeometry(
    new EllipsoidGeometry({
      vertexFormat: VertexFormat.POSITION_ONLY,
      stackPartitions: 32,
      slicePartitions: 32,
    })
  );

  const vertexArray = VertexArray.fromGeometry({
    context: context,
    geometry: geometry,
    attributeLocations: attributeLocations,
    bufferUsage: BufferUsage.STATIC_DRAW,
    interleave: false,
  });
  return vertexArray;
}

/**
 * Create the dome face line vertices
 * @param context
 */
function createDomeLineVertexArray(context: Context) {
  const geometry = EllipsoidOutlineGeometry.createGeometry(
    new EllipsoidOutlineGeometry({
      // vertexFormat: VertexFormat.POSITION_ONLY,
      stackPartitions: 32,
      slicePartitions: 32,
    })
  );

  const vertexArray = VertexArray.fromGeometry({
    context: context,
    geometry: geometry,
    attributeLocations: attributeLocations,
    bufferUsage: BufferUsage.STATIC_DRAW,
    interleave: false,
  });
  return vertexArray;
}

/**
 * Create scan plane faces
 * @param context
 * @param positions
 * @returns {*}
 */
function createScanPlaneVertexArray(context: Context, positions: Cartesian3[]) {
  const planeLength = positions.length - 1;
  const vertices = new Float32Array(3 * 3 * planeLength);

  let k = 0;
  for (let i = 0; i < planeLength; i++) {
    vertices[k++] = 0.0;
    vertices[k++] = 0.0;
    vertices[k++] = 0.0;

    vertices[k++] = positions[i].x;
    vertices[k++] = positions[i].y;
    vertices[k++] = positions[i].z;

    vertices[k++] = positions[i + 1].x;
    vertices[k++] = positions[i + 1].y;
    vertices[k++] = positions[i + 1].z;
  }

  const vertexBuffer = Buffer.createVertexBuffer({
    context: context,
    typedArray: vertices,
    usage: BufferUsage.STATIC_DRAW,
  });

  const stride = 3 * Float32Array.BYTES_PER_ELEMENT;

  const attributes = [
    {
      index: attributeLocations.position,
      vertexBuffer: vertexBuffer,
      componentsPerAttribute: 3,
      componentDatatype: ComponentDatatype.FLOAT,
      offsetInBytes: 0,
      strideInBytes: stride,
    },
  ];

  return new VertexArray({
    context: context,
    attributes: attributes,
  });
}

function createVertexArray(primitive: any, frameState: FrameState) {
  const context = frameState.context;

  const unitSectorPositions = computeUnitPosition(
    primitive,
    primitive.xHalfAngle ?? 0,
    primitive.yHalfAngle ?? 0
  );
  const positions = computeSectorPositions(primitive, unitSectorPositions);

  // render sectors
  if (primitive.showLateralSurfaces) {
    primitive._sectorVA = createSectorVertexArray(context, positions);
  }

  // render sector lines
  if (primitive.showSectorLines) {
    primitive._sectorLineVA = createSectorLineVertexArray(context, positions);
  }

  if (primitive.showSectorSegmentLines) {
    primitive._sectorSegmentLineVA = createSectorSegmentLineVertexArray(
      context,
      positions
    );
  }

  // render dome
  if (primitive.showDomeSurfaces) {
    primitive._domeVA = createDomeVertexArray(context);
  }

  // render dome lines
  if (primitive.showDomeLines) {
    primitive._domeLineVA = createDomeLineVertexArray(context);
  }

  // render scan plane
  if (primitive.showScanPlane) {
    if (primitive.scanPlaneMode == 'horizontal') {
      const unitScanPlanePositions = computeUnitPosition(
        primitive,
        Math.PI / 2,
        0
      );
      primitive._scanPlaneVA = createScanPlaneVertexArray(
        context,
        unitScanPlanePositions.zx
      );
    } else {
      const unitScanPlanePositions = computeUnitPosition(
        primitive,
        0,
        Math.PI / 2
      );
      primitive._scanPlaneVA = createScanPlaneVertexArray(
        context,
        unitScanPlanePositions.zy
      );
    }
  }
}

//endregion

RectangularPyramidSensorVolume.prototype.isDestroyed = function () {
  return false;
};

RectangularPyramidSensorVolume.prototype.destroy = function () {
  const entities = this._entitiesToVisualize.values;
  const hash = this._hash;
  const primitives = this._primitives;
  for (let i = entities.length - 1; i > -1; i--) {
    removePrimitive(entities[i], hash, primitives);
  }
  return destroyObject(this);
};

//region -- ShaderProgram --

function createCommonShaderProgram(
  primitive: any,
  frameState: FrameState,
  material: Material
) {
  const context = frameState.context;

  const vs = RectangularSensorVS;
  const fs = new ShaderSource({
    sources: [RectangularSensor, material.shaderSource, RectangularSensorFS],
  });

  primitive._shaderProgram = ShaderProgram.replaceCache({
    context: context,
    shaderProgram: primitive._shaderProgram,
    vertexShaderSource: vs,
    fragmentShaderSource: fs,
    attributeLocations: attributeLocations,
  });

  const pickFS = new ShaderSource({
    sources: [RectangularSensor, material.shaderSource, RectangularSensorFS],
    pickColorQualifier: 'uniform',
  });

  primitive._pickShaderProgram = ShaderProgram.replaceCache({
    context: context,
    shaderProgram: primitive._pickShaderProgram,
    vertexShaderSource: vs,
    fragmentShaderSource: pickFS,
    attributeLocations: attributeLocations,
  });
}

function createScanPlaneShaderProgram(
  primitive: any,
  frameState: FrameState,
  material: Material
) {
  const context = frameState.context;

  const vs = RectangularSensorVS;
  const fs = new ShaderSource({
    sources: [
      RectangularSensor,
      material.shaderSource,
      RectangularSensorScanPlaneFS,
    ],
  });

  primitive._scanPlaneShaderProgram = ShaderProgram.replaceCache({
    context: context,
    shaderProgram: primitive._scanPlaneShaderProgram,
    vertexShaderSource: vs,
    fragmentShaderSource: fs,
    attributeLocations: attributeLocations,
  });
}

function createShaderProgram(
  primitive: any,
  frameState: FrameState,
  material: Material
) {
  createCommonShaderProgram(primitive, frameState, material);

  if (primitive.showScanPlane) {
    createScanPlaneShaderProgram(primitive, frameState, material);
  }
}

//endregion

//region -- RenderState --

function createRenderState(
  primitive: any,
  showThroughEllipsoid: boolean,
  translucent: boolean
) {
  if (translucent) {
    primitive._frontFaceRS = RenderState.fromCache({
      depthTest: {
        enabled: !showThroughEllipsoid,
      },
      depthMask: false,
      blending: BlendingState.ALPHA_BLEND,
      cull: {
        enabled: true,
        face: CullFace.BACK,
      },
    });

    primitive._backFaceRS = RenderState.fromCache({
      depthTest: {
        enabled: !showThroughEllipsoid,
      },
      depthMask: false,
      blending: BlendingState.ALPHA_BLEND,
      cull: {
        enabled: true,
        face: CullFace.FRONT,
      },
    });

    primitive._pickRS = RenderState.fromCache({
      depthTest: {
        enabled: !showThroughEllipsoid,
      },
      depthMask: false,
      blending: BlendingState.ALPHA_BLEND,
    });
  } else {
    primitive._frontFaceRS = RenderState.fromCache({
      depthTest: {
        enabled: !showThroughEllipsoid,
      },
      depthMask: true,
    });

    primitive._pickRS = RenderState.fromCache({
      depthTest: {
        enabled: true,
      },
      depthMask: true,
    });
  }
}

//endregion

//region -- Command --

function createCommand(
  primitive: any,
  frontCommand: DrawCommand,
  backCommand: DrawCommand | undefined,
  frontFaceRS: RenderState,
  backFaceRS: RenderState,
  sp: ShaderProgram,
  va: VertexArray,
  uniforms: any,
  modelMatrix: Matrix4,
  translucent: boolean,
  pass: Pass,
  isLine: boolean
) {
  if (translucent && backCommand) {
    backCommand.vertexArray = va;
    backCommand.renderState = backFaceRS;
    backCommand.shaderProgram = sp;
    backCommand.uniformMap = combine(
      uniforms,
      primitive._lateralSurfaceMaterial._uniforms
    );
    backCommand.uniformMap.u_normalDirection = function () {
      return -1.0;
    };
    backCommand.pass = pass;
    backCommand.modelMatrix = modelMatrix;
    primitive._colorCommands.push(backCommand);
  }

  frontCommand.vertexArray = va;
  frontCommand.renderState = frontFaceRS;
  frontCommand.shaderProgram = sp;
  frontCommand.uniformMap = combine(
    uniforms,
    primitive._lateralSurfaceMaterial._uniforms
  );
  if (isLine) {
    frontCommand.uniformMap.u_type = function () {
      return 1;
    };
  }
  frontCommand.pass = pass;
  frontCommand.modelMatrix = modelMatrix;
  primitive._colorCommands.push(frontCommand);
}

function createCommands(primitive: any, translucent: boolean) {
  primitive._colorCommands.length = 0;

  const pass = translucent ? Pass.TRANSLUCENT : Pass.OPAQUE;

  if (primitive.showLateralSurfaces) {
    createCommand(
      primitive,
      primitive._sectorFrontCommand,
      primitive._sectorBackCommand,
      primitive._frontFaceRS,
      primitive._backFaceRS,
      primitive._shaderProgram,
      primitive._sectorVA,
      primitive._uniforms,
      primitive._computedModelMatrix,
      translucent,
      pass,
      false
    );
  }
  if (primitive.showSectorLines) {
    createCommand(
      primitive,
      primitive._sectorLineCommand,
      undefined,
      primitive._frontFaceRS,
      primitive._backFaceRS,
      primitive._shaderProgram,
      primitive._sectorLineVA,
      primitive._uniforms,
      primitive._computedModelMatrix,
      translucent,
      pass,
      true
    );
  }

  if (primitive.showSectorSegmentLines) {
    createCommand(
      primitive,
      primitive._sectorSegmentLineCommand,
      undefined,
      primitive._frontFaceRS,
      primitive._backFaceRS,
      primitive._shaderProgram,
      primitive._sectorSegmentLineVA,
      primitive._uniforms,
      primitive._computedModelMatrix,
      translucent,
      pass,
      true
    );
  }
  if (primitive.showDomeSurfaces) {
    createCommand(
      primitive,
      primitive._domeFrontCommand,
      primitive._domeBackCommand,
      primitive._frontFaceRS,
      primitive._backFaceRS,
      primitive._shaderProgram,
      primitive._domeVA,
      primitive._uniforms,
      primitive._computedModelMatrix,
      translucent,
      pass,
      false
    );
  }
  if (primitive.showDomeLines) {
    createCommand(
      primitive,
      primitive._domeLineCommand,
      undefined,
      primitive._frontFaceRS,
      primitive._backFaceRS,
      primitive._shaderProgram,
      primitive._domeLineVA,
      primitive._uniforms,
      primitive._computedModelMatrix,
      translucent,
      pass,
      true
    );
  }

  if (primitive.showScanPlane) {
    createCommand(
      primitive,
      primitive._scanPlaneFrontCommand,
      primitive._scanPlaneBackCommand,
      primitive._frontFaceRS,
      primitive._backFaceRS,
      primitive._scanPlaneShaderProgram,
      primitive._scanPlaneVA,
      primitive._scanPlaneUniforms,
      primitive._computedScanPlaneModelMatrix,
      translucent,
      pass,
      false
    );
  }
}
