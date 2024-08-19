## cesium-sensors

Adds sensor volumes to Cesium.

## Usage

Prebuilt minified and unminified versions of the plugin are in the [dist](dist/) directory.

The plugin automatically adds support for the CZML properties `agi_conicSensor`, `agi_customPatternSensor`, and `agi_rectangularSensor`. The corresponding `Entity` properties are `conicSensor`, `customPatternSensor`, and `rectangularSensor`.

In order to load data directly into `Entity` objects that you create directly, you must call `entity.addProperty` to create each of the sensor properties you wish to use. The CZML processing does this automatically.

```js
import * as Cesium from 'cesium';
import * as CesiumSensorVolumes from 'cesium-sensors-es6';
// To create an entity directly
var entityCollection = new Cesium.EntityCollection();

var entity = entityCollection.getOrCreateEntity('test');
entity.addProperty('conicSensor');

// configure other entity properties, e.g. position and orientation...

entity.conicSensor = new CesiumSensorVolumes.ConicSensorGraphics();
entity.conicSensor.intersectionColor = new Cesium.ConstantProperty(
  new Cesium.Color(0.1, 0.2, 0.3, 0.4)
);
```

## License

MIT Free for commercial and non-commercial use. See [LICENSE.md](LICENSE.md).
