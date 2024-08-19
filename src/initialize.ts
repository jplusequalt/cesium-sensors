import {
  Cartesian3,
  Color,
  CzmlDataSource,
  DataSourceDisplay,
  defined,
  Spherical,
  TimeInterval
} from 'cesium';
import { ConicSensorGraphics } from './conic/conic-sensor-graphics';
import { ConicSensorVisualizer } from './conic/conic-sensor-visualizer';
import { CustomPatternSensorGraphics } from './custom/custom-pattern-sensor-graphics';
import { CustomPatternSensorVisualizer } from './custom/custom-pattern-sensor-visualizer';
import { RectangularSensorGraphics } from './rectangular/rectangular-sensor-graphics';
import { RectangularSensorVisualizer } from './rectangular/rectangular-sensor-visualizer';
// import { RectangularSensorGraphics } from "./rectangular/RectangularSensorGraphics";
// import { RectangularSensorVisualizer } from './rectangular/RectangularSensorVisualizer';

const processPacketData = CzmlDataSource.processPacketData;
const processMaterialPacketData = CzmlDataSource.processMaterialPacketData;

function processDirectionData(
  customPatternSensor: any,
  directions: any,
  interval: any,
  sourceUri: any,
  entityCollection: any
) {
  let i;
  let len;
  const values: any[] = [];
  const unitSphericals = directions.unitSpherical;
  const sphericals = directions.spherical;
  const unitCartesians = directions.unitCartesian;
  const cartesians = directions.cartesian;

  if (defined(unitSphericals)) {
    for (i = 0, len = unitSphericals.length; i < len; i += 2) {
      values.push(new Spherical(unitSphericals[i], unitSphericals[i + 1]));
    }
    directions.array = values;
  } else if (defined(sphericals)) {
    for (i = 0, len = sphericals.length; i < len; i += 3) {
      values.push(
        new Spherical(sphericals[i], sphericals[i + 1], sphericals[i + 2])
      );
    }
    directions.array = values;
  } else if (defined(unitCartesians)) {
    for (i = 0, len = unitCartesians.length; i < len; i += 3) {
      const tmp = Spherical.fromCartesian3(
        new Cartesian3(
          unitCartesians[i],
          unitCartesians[i + 1],
          unitCartesians[i + 2]
        )
      );
      Spherical.normalize(tmp, tmp);
      values.push(tmp);
    }
    directions.array = values;
  } else if (defined(cartesians)) {
    for (i = 0, len = cartesians.length; i < len; i += 3) {
      values.push(
        Spherical.fromCartesian3(
          new Cartesian3(cartesians[i], cartesians[i + 1], cartesians[i + 2])
        )
      );
    }
    directions.array = values;
  }
  processPacketData(
    Array,
    customPatternSensor,
    'directions',
    directions,
    interval,
    sourceUri,
    entityCollection
  );
}

function processCommonSensorProperties(
  sensor,
  sensorData,
  interval,
  sourceUri,
  entityCollection
) {
  processPacketData(
    Boolean,
    sensor,
    'show',
    sensorData.show,
    interval,
    sourceUri,
    entityCollection
  );
  processPacketData(
    Number,
    sensor,
    'radius',
    sensorData.radius,
    interval,
    sourceUri,
    entityCollection
  );
  processPacketData(
    Boolean,
    sensor,
    'showIntersection',
    sensorData.showIntersection,
    interval,
    sourceUri,
    entityCollection
  );
  processPacketData(
    Color as any,
    sensor,
    'intersectionColor',
    sensorData.intersectionColor,
    interval,
    sourceUri,
    entityCollection
  );
  processPacketData(
    Number,
    sensor,
    'intersectionWidth',
    sensorData.intersectionWidth,
    interval,
    sourceUri,
    entityCollection
  );
  // processMaterialPacketData(
  //   Material,
  //   'lateralSurfaceMaterial',
  //   sensorData.lateralSurfaceMaterial,
  //   interval,
  //   sourceUri,
  //   entityCollection
  // );
}

function processConicSensor(entity, packet, entityCollection, sourceUri) {
  const conicSensorData = packet.agi_conicSensor;
  if (!defined(conicSensorData)) {
    return;
  }

  let interval;
  const intervalString = conicSensorData.interval;
  if (defined(intervalString)) {
    const iso8601Scratch = {
      iso8601: intervalString,
    };
    interval = TimeInterval.fromIso8601(iso8601Scratch);
  }

  let conicSensor = entity.conicSensor;
  if (!defined(conicSensor)) {
    entity.addProperty('conicSensor');
    conicSensor = new ConicSensorGraphics();
    entity.conicSensor = conicSensor;
  }

  processCommonSensorProperties(
    conicSensor,
    conicSensorData,
    interval,
    sourceUri,
    entityCollection
  );
  processPacketData(
    Number,
    conicSensor,
    'innerHalfAngle',
    conicSensorData.innerHalfAngle,
    interval,
    sourceUri,
    entityCollection
  );
  processPacketData(
    Number,
    conicSensor,
    'outerHalfAngle',
    conicSensorData.outerHalfAngle,
    interval,
    sourceUri,
    entityCollection
  );
  processPacketData(
    Number,
    conicSensor,
    'minimumClockAngle',
    conicSensorData.minimumClockAngle,
    interval,
    sourceUri,
    entityCollection
  );
  processPacketData(
    Number,
    conicSensor,
    'maximumClockAngle',
    conicSensorData.maximumClockAngle,
    interval,
    sourceUri,
    entityCollection
  );
}

function processCustomPatternSensor(
  entity,
  packet,
  entityCollection,
  sourceUri
) {
  const customPatternSensorData = packet.agi_customPatternSensor;
  if (!defined(customPatternSensorData)) {
    return;
  }

  let interval;
  const intervalString = customPatternSensorData.interval;
  if (defined(intervalString)) {
    const iso8601Scratch = {
      iso8601: intervalString,
    };
    interval = TimeInterval.fromIso8601(iso8601Scratch);
  }

  let customPatternSensor = entity.customPatternSensor;
  if (!defined(customPatternSensor)) {
    entity.addProperty('customPatternSensor');
    customPatternSensor = new CustomPatternSensorGraphics();
    entity.customPatternSensor = customPatternSensor;
  }

  processCommonSensorProperties(
    customPatternSensor,
    customPatternSensorData,
    interval,
    sourceUri,
    entityCollection
  );

  // The directions property is a special case value that can be an array of unitSpherical or unit Cartesians.
  // We pre-process this into Spherical instances and then process it like any other array.
  const directions = customPatternSensorData.directions;
  if (defined(directions)) {
    if (Array.isArray(directions)) {
      const length = directions.length;
      for (let i = 0; i < length; i++) {
        processDirectionData(
          customPatternSensor,
          directions[i],
          interval,
          sourceUri,
          entityCollection
        );
      }
    } else {
      processDirectionData(
        customPatternSensor,
        directions,
        interval,
        sourceUri,
        entityCollection
      );
    }
  }
}

function processRectangularSensor(entity, packet, entityCollection, sourceUri) {
  const rectangularSensorData = packet.agi_rectangularSensor;
  if (!defined(rectangularSensorData)) {
    return;
  }

  let interval;
  const intervalString = rectangularSensorData.interval;
  if (defined(intervalString)) {
    const iso8601Scratch = {
      iso8601: intervalString,
    };
    interval = TimeInterval.fromIso8601(iso8601Scratch);
  }

  let rectangularSensor = entity.rectangularSensor;
  if (!defined(rectangularSensor)) {
    entity.addProperty('rectangularSensor');
    rectangularSensor = new RectangularSensorGraphics(undefined);
    entity.rectangularSensor = rectangularSensor;
  }

  processCommonSensorProperties(
    rectangularSensor,
    rectangularSensorData,
    interval,
    sourceUri,
    entityCollection
  );
  processPacketData(
    Number,
    rectangularSensor,
    'xHalfAngle',
    rectangularSensorData.xHalfAngle,
    interval,
    sourceUri,
    entityCollection
  );
  processPacketData(
    Number,
    rectangularSensor,
    'yHalfAngle',
    rectangularSensorData.yHalfAngle,
    interval,
    sourceUri,
    entityCollection
  );
  processPacketData(
    Boolean,
    rectangularSensor,
    'showDomeSurfaces',
    rectangularSensorData.showDomeSurfaces,
    interval,
    sourceUri,
    entityCollection
  );
  processPacketData(
    Boolean,
    rectangularSensor,
    'showThroughEllipsoid',
    rectangularSensorData.showThroughEllipsoid,
    interval,
    sourceUri,
    entityCollection
  );
  processMaterialPacketData(
    rectangularSensor,
    'material',
    rectangularSensorData.material,
    interval,
    sourceUri,
    entityCollection
  );
  processMaterialPacketData(
    rectangularSensor,
    'domeSurfaceMaterial',
    rectangularSensorData.domeSurfaceMaterial,
    interval,
    sourceUri,
    entityCollection
  );
  processMaterialPacketData(
    rectangularSensor,
    'lateralSurfaceMaterial',
    rectangularSensorData.lateralSurfaceMaterial,
    interval,
    sourceUri,
    entityCollection
  );
}

let initialized = false;
export function initialize() {
  if (initialized) {
    return;
  }

  CzmlDataSource.updaters.push(
    processConicSensor,
    processCustomPatternSensor,
    processRectangularSensor
  );

  const originalDefaultVisualizersCallback: any =
    DataSourceDisplay.defaultVisualizersCallback;
  DataSourceDisplay.defaultVisualizersCallback = function (
    scene,
    entityCluster,
    dataSource
  ) {
    const entities = dataSource.entities;
    const array = originalDefaultVisualizersCallback(
      scene,
      entityCluster,
      dataSource
    );
    return array.concat([
      new ConicSensorVisualizer(scene, entities),
      new CustomPatternSensorVisualizer(scene, entities),
      new RectangularSensorVisualizer(scene, entities),
    ]);
  } as any;

  initialized = true;
}
