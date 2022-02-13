import * as three from "three"

export class GeometryStatistics {
    boundingBox: three.Box3;
    boundingSphere: three.Sphere;
    stdDev: three.Vector3;
};

export function calculateStatistics (geom: three.BufferGeometry): GeometryStatistics {
    let stats = new GeometryStatistics();

    let meanX = 0, meanY = 0, meanZ = 0;
    let sumX = 0, sumY = 0, sumZ = 0;

    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    let minX = Infinity, minY = Infinity, minZ = Infinity;

    let maxRadiusSq = 0;
    let point = new three.Vector3();
    let center = new three.Vector3();

    let attrib = geom.attributes.position;

    for (let i = 0, l = attrib.count; i < l; i++){
        let x = attrib.getX(i);
        let y = attrib.getY(i);
        let z = attrib.getZ(i);

        if (minX > x) minX = x;
        if (minY > y) minY = y;
        if (minZ > z) minZ = z;

        if (maxX < x) maxX = x;
        if (maxY < y) maxY = y;
        if (maxZ < z) maxZ = z;

        sumX += x;
        sumY += y;
        sumZ += z;
    }

    stats.boundingBox = new three.Box3(
        new three.Vector3(minX, minY, minZ),
        new three.Vector3(maxX, maxY, maxZ)
    );

    stats.boundingBox.getCenter(center);

    meanX = sumX / attrib.count;
    meanY = sumY / attrib.count;
    meanZ = sumZ / attrib.count;
    sumX = sumY = sumZ = 0;

    // Get std deviation + bounding sphere
    for (let i = 0, l = attrib.count; i < l; i++){
        let x = attrib.getX(i);
        let y = attrib.getY(i);
        let z = attrib.getZ(i);

        sumX += Math.pow(x - meanX, 2);
        sumY += Math.pow(y - meanY, 2);
        sumZ += Math.pow(z - meanZ, 2);

        point.set(x,y,z);
        maxRadiusSq = Math.max(maxRadiusSq, center.distanceToSquared(point));
    }

    stats.boundingSphere = new three.Sphere(center, Math.sqrt(maxRadiusSq));
    stats.stdDev = new three.Vector3(
        Math.sqrt(sumX / attrib.count),
        Math.sqrt(sumY / attrib.count),
        Math.sqrt(sumZ / attrib.count)
    );

    return stats;
}