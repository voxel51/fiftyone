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

// Computes vertex normals on three.js buffer geometry, even when the mesh
// uses triangle strip connectivity.
export function computeVertexNormals (bufferGeometry): void {
    if (bufferGeometry.drawMode === three.TrianglesDrawMode) {
        bufferGeometry.computeVertexNormals();
        return;
    } else if (bufferGeometry.drawMode === three.TriangleStripDrawMode) {
        if (bufferGeometry.attributes.position === undefined) {
            return;
        }
        const inPositions = bufferGeometry.attributes.position.array;
        if (bufferGeometry.attributes.normal === undefined) {
            bufferGeometry.addAttribute(
                'normal',
                new three.BufferAttribute(new Float32Array(inPositions.length),
                    3));
        } else {
            // Reset existing normals to zero.
            const array = bufferGeometry.attributes.normal.array;
            for (let i = 0; i < array.length; ++i) {
                array[i] = 0;
            }
        }
        let outNormals = bufferGeometry.attributes.normal.array;

        let pos0 = new three.Vector3();
        let pos1 = new three.Vector3();
        let pos2 = new three.Vector3();
        let posDif0 = new three.Vector3(), posDif1 = new three.Vector3();
        let localNormal = new three.Vector3();

        const stripIndices = bufferGeometry.index.array;
        for (let i = 2; i < stripIndices.length; ++i) {
            let index0 = stripIndices[i - 2] * 3;
            let index1 = stripIndices[i - 1] * 3;
            let index2 = stripIndices[i] * 3;
            // Skip degenerate triangles.
            if (index0 === index1 || index0 === index2 || index1 === index2) {
                continue;
            }
            if ((i & 1) !== 0) {
                // Swap index 1 and 0 on odd indexed triangles.
                const tmpIndex = index1;
                index1 = index2;
                index2 = tmpIndex;
            }

            // Get position values.
            pos0.fromArray(inPositions, index0);
            pos1.fromArray(inPositions, index1);
            pos2.fromArray(inPositions, index2);

            // Position differences
            posDif0.subVectors(pos2, pos0);
            posDif1.subVectors(pos1, pos0);

            // Weighted normal.
            localNormal.crossVectors(posDif1, posDif0);

            // Update normals on vertices
            outNormals[index0] += localNormal.x;
            outNormals[index0 + 1] += localNormal.y;
            outNormals[index0 + 2] += localNormal.z;

            outNormals[index1] += localNormal.x;
            outNormals[index1 + 1] += localNormal.y;
            outNormals[index1 + 2] += localNormal.z;

            outNormals[index2] += localNormal.x;
            outNormals[index2 + 1] += localNormal.y;
            outNormals[index2 + 2] += localNormal.z;
        }
        bufferGeometry.normalizeNormals();
        bufferGeometry.attributes.normal.needsUpdate = true;
    }
}