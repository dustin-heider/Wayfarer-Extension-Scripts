class S2Overlay {
  constructor() {
    this.polyLines = [];
  }

  check_map_bounds_ready(map) {
    if (!map || map.getBounds === undefined || map.getBounds() === undefined) {
      return false;
    } else {
      return true;
    }
  }

  until(conditionFunction, map) {
    const poll = resolve => {
      if(conditionFunction(map)) {resolve();} else {setTimeout(_ => poll(resolve), 400);}
    };

    return new Promise(poll);
  }

  updateGrid(map, gridLevel, col, thickness = 1, secondGridLevel = null, secondCol = null) {
    this.polyLines.forEach((line) => {
      line.setMap(null);
    });
    const ret = this.drawCellGrid(map, gridLevel, col, thickness );
    if (secondGridLevel !== null) {
      this.drawCellGrid(map, secondGridLevel, secondCol, 2);
    }
    return ret;
  }

  async drawCellGrid(map, gridLevel, col, thickness = 1) {
    await this.until(this.check_map_bounds_ready, map);
    const bounds = map.getBounds();

    const seenCells = {};
    const cellsToDraw = [];

    if (gridLevel >= 2 && gridLevel < (map.getZoom() + 2)) {
      const latLng = map.getCenter();
      const cell = S2.S2Cell.FromLatLng(this.getLatLngPoint(latLng), gridLevel);
      cellsToDraw.push(cell);
      seenCells[cell.toString()] = true;

      let curCell;
      while (cellsToDraw.length > 0) {
        curCell = cellsToDraw.pop();
        const neighbors = curCell.getNeighbors();

        for (let n = 0; n < neighbors.length; n++) {
          const nStr = neighbors[n].toString();
          if (!seenCells[nStr]) {
            seenCells[nStr] = true;
            if (this.isCellOnScreen(bounds, neighbors[n])) {
              cellsToDraw.push(neighbors[n]);
            }
          }
        }

        this.drawCell(map, curCell, col, thickness);
      }
    }
  }

  drawCell(map, cell, col, thickness) {
    const cellCorners = cell.getCornerLatLngs();
    cellCorners[4] = cellCorners[0]; // Loop it

    const polyline = new google.maps.Polyline({
      path: cellCorners,
      geodesic: true,
      fillColor: "grey",
      fillOpacity: 0.0,
      strokeColor: col,
      strokeOpacity: 1,
      strokeWeight: thickness,
      map: map
    });
    this.polyLines.push(polyline);
  }

	 getLatLngPoint(data) {
    const result = {
      lat: "function" === typeof data.lat ? data.lat() : data.lat,
      lng: "function" === typeof data.lng ? data.lng() : data.lng
    };

    return result;
  }

  isCellOnScreen(mapBounds, cell) {
    const corners = cell.getCornerLatLngs();
    for (let i = 0; i < corners.length; i++) {
      if (mapBounds.intersects(new google.maps.LatLngBounds(corners[i]))) {
        return true;
      }
    }
    return false;
  }
}

// start s2 lib code
(function(exports) {
  "use strict";

  const S2 = exports.S2 = {
    L: {}
  };

  S2.L.LatLng = function( /* Number */ rawLat, /* Number */ rawLng, /* Boolean */ noWrap) {
    let lat = parseFloat(rawLat, 10);
    let lng = parseFloat(rawLng, 10);

    if (isNaN(lat) || isNaN(lng)) {
      throw new Error("Invalid LatLng object: (" + rawLat + ", " + rawLng + ")");
    }

    if (noWrap !== true) {
      lat = Math.max(Math.min(lat, 90), -90); // clamp latitude into -90..90
      lng = (lng + 180) % 360 + ((lng < -180 || 180 === lng) ? 180 : -180); // wrap longtitude into -180..180
    }

    return {
      lat: lat,
      lng: lng
    };
  };

  S2.L.LatLng.DEG_TO_RAD = Math.PI / 180;
  S2.L.LatLng.RAD_TO_DEG = 180 / Math.PI;

  S2.LatLngToXYZ = function(latLng) {
    const d2r = S2.L.LatLng.DEG_TO_RAD;

    const phi = latLng.lat * d2r;
    const theta = latLng.lng * d2r;

    const cosphi = Math.cos(phi);

    return [Math.cos(theta) * cosphi, Math.sin(theta) * cosphi, Math.sin(phi)];
  };

  S2.XYZToLatLng = function(xyz) {
    const r2d = S2.L.LatLng.RAD_TO_DEG;

    const lat = Math.atan2(xyz[2], Math.sqrt(xyz[0] * xyz[0] + xyz[1] * xyz[1]));
    const lng = Math.atan2(xyz[1], xyz[0]);

    return S2.L.LatLng(lat * r2d, lng * r2d);
  };

  const largestAbsComponent = function(xyz) {
    const temp = [Math.abs(xyz[0]), Math.abs(xyz[1]), Math.abs(xyz[2])];

    if (temp[0] > temp[1]) {
      if (temp[0] > temp[2]) {
        return 0;
      } else {
        return 2;
      }
    } else if (temp[1] > temp[2]) {
      return 1;
    } else {
      return 2;
    }

  };

  const faceXYZToUV = function(face, xyz) {
    let u, v;

    switch (face) {
    case 0:
      u = xyz[1] / xyz[0];
      v = xyz[2] / xyz[0];
      break;
    case 1:
      u = -xyz[0] / xyz[1];
      v = xyz[2] / xyz[1];
      break;
    case 2:
      u = -xyz[0] / xyz[2];
      v = -xyz[1] / xyz[2];
      break;
    case 3:
      u = xyz[2] / xyz[0];
      v = xyz[1] / xyz[0];
      break;
    case 4:
      u = xyz[2] / xyz[1];
      v = -xyz[0] / xyz[1];
      break;
    case 5:
      u = -xyz[1] / xyz[2];
      v = -xyz[0] / xyz[2];
      break;
    default:
      throw {
        error: "Invalid face"
      };
    }

    return [u, v];
  };

  S2.XYZToFaceUV = function(xyz) {
    let face = largestAbsComponent(xyz);

    if (xyz[face] < 0) {
      face += 3;
    }

    const uv = faceXYZToUV(face, xyz);

    return [face, uv];
  };

  S2.FaceUVToXYZ = function(face, uv) {
    const u = uv[0];
    const v = uv[1];

    switch (face) {
    case 0:
      return [1, u, v];
    case 1:
      return [-u, 1, v];
    case 2:
      return [-u, -v, 1];
    case 3:
      return [-1, -v, -u];
    case 4:
      return [v, -1, -u];
    case 5:
      return [v, u, -1];
    default:
      throw {
        error: "Invalid face"
      };
    }
  };

  const singleSTtoUV = function(st) {
    if (st >= 0.5) {
      return (1 / 3.0) * (4 * st * st - 1);
    } else {
      return (1 / 3.0) * (1 - (4 * (1 - st) * (1 - st)));
    }
  };

  S2.STToUV = function(st) {
    return [singleSTtoUV(st[0]), singleSTtoUV(st[1])];
  };


  const singleUVtoST = function(uv) {
    if (uv >= 0) {
      return 0.5 * Math.sqrt(1 + 3 * uv);
    } else {
      return 1 - 0.5 * Math.sqrt(1 - 3 * uv);
    }
  };
  S2.UVToST = function(uv) {
    return [singleUVtoST(uv[0]), singleUVtoST(uv[1])];
  };


  S2.STToIJ = function(st, order) {
    const maxSize = (1 << order);

    const singleSTtoIJ = function(st) {
      const ij = Math.floor(st * maxSize);
      return Math.max(0, Math.min(maxSize - 1, ij));
    };

    return [singleSTtoIJ(st[0]), singleSTtoIJ(st[1])];
  };


  S2.IJToST = function(ij, order, offsets) {
    const maxSize = (1 << order);

    return [
      (ij[0] + offsets[0]) / maxSize,
      (ij[1] + offsets[1]) / maxSize
    ];
  };


  const rotateAndFlipQuadrant = function(n, point, rx, ry) {
    let newX, newY;
    if (0 == ry) {
      if (1 == rx) {
        point.x = n - 1 - point.x;
        point.y = n - 1 - point.y;

      }

      const x = point.x;
      point.x = point.y;
      point.y = x;
    }

  };


  // hilbert space-filling curve
  // based on http://blog.notdot.net/2009/11/Damn-Cool-Algorithms-Spatial-indexing-with-Quadtrees-and-Hilbert-Curves
  // note: rather then calculating the final integer hilbert position, we just return the list of quads
  // this ensures no precision issues whth large orders (S3 cell IDs use up to 30), and is more
  // convenient for pulling out the individual bits as needed later
  const pointToHilbertQuadList = function(x, y, order, face) {
    const hilbertMap = {
      "a": [
        [0, "d"],
        [1, "a"],
        [3, "b"],
        [2, "a"]
      ],
      "b": [
        [2, "b"],
        [1, "b"],
        [3, "a"],
        [0, "c"]
      ],
      "c": [
        [2, "c"],
        [3, "d"],
        [1, "c"],
        [0, "b"]
      ],
      "d": [
        [0, "a"],
        [3, "c"],
        [1, "d"],
        [2, "d"]
      ]
    };

    if ("number" !== typeof face) {
      console.warn(new Error("called pointToHilbertQuadList without face value, defaulting to '0'").stack);
    }
    let currentSquare = (face % 2) ? "d" : "a";
    const positions = [];

    for (let i = order - 1; i >= 0; i--) {

      const mask = 1 << i;

      const quad_x = x & mask ? 1 : 0;
      const quad_y = y & mask ? 1 : 0;

      const t = hilbertMap[currentSquare][quad_x * 2 + quad_y];

      positions.push(t[0]);

      currentSquare = t[1];
    }

    return positions;
  };

  // S2Cell class

  S2.S2Cell = function() {};

  S2.S2Cell.FromHilbertQuadKey = function(hilbertQuadkey) {
    const parts = hilbertQuadkey.split("/");
    const face = parseInt(parts[0]);
    const position = parts[1];
    const maxLevel = position.length;
    const point = {
      x: 0,
      y: 0
    };
    let i;
    let level;
    let bit;
    let rx, ry;
    let val;

    for (i = maxLevel - 1; i >= 0; i--) {

      level = maxLevel - i;
      bit = position[i];
      rx = 0;
      ry = 0;
      if ("1" === bit) {
        ry = 1;
      } else if ("2" === bit) {
        rx = 1;
        ry = 1;
      } else if ("3" === bit) {
        rx = 1;
      }

      val = Math.pow(2, level - 1);
      rotateAndFlipQuadrant(val, point, rx, ry);

      point.x += val * rx;
      point.y += val * ry;

    }

    if (1 === face % 2) {
      const t = point.x;
      point.x = point.y;
      point.y = t;
    }


    return S2.S2Cell.FromFaceIJ(parseInt(face), [point.x, point.y], level);
  };

  // static method to construct
  S2.S2Cell.FromLatLng = function(latLng, level) {
    if ((!latLng.lat && latLng.lat !== 0) || (!latLng.lng && latLng.lng !== 0)) {
      throw new Error("Pass { lat: lat, lng: lng } to S2.S2Cell.FromLatLng");
    }
    const xyz = S2.LatLngToXYZ(latLng);

    const faceuv = S2.XYZToFaceUV(xyz);
    const st = S2.UVToST(faceuv[1]);

    const ij = S2.STToIJ(st, level);

    return S2.S2Cell.FromFaceIJ(faceuv[0], ij, level);
  };

  S2.S2Cell.FromFaceIJ = function(face, ij, level) {
    const cell = new S2.S2Cell();
    cell.face = face;
    cell.ij = ij;
    cell.level = level;

    return cell;
  };


  S2.S2Cell.prototype.toString = function() {
    return "F" + this.face + "ij[" + this.ij[0] + "," + this.ij[1] + "]@" + this.level;
  };

  S2.S2Cell.prototype.getLatLng = function() {
    const st = S2.IJToST(this.ij, this.level, [0.5, 0.5]);
    const uv = S2.STToUV(st);
    const xyz = S2.FaceUVToXYZ(this.face, uv);

    return S2.XYZToLatLng(xyz);
  };

  S2.S2Cell.prototype.getCornerLatLngs = function() {
    const result = [];
    const offsets = [
      [0.0, 0.0],
      [0.0, 1.0],
      [1.0, 1.0],
      [1.0, 0.0]
    ];

    for (let i = 0; i < 4; i++) {
      const st = S2.IJToST(this.ij, this.level, offsets[i]);
      const uv = S2.STToUV(st);
      const xyz = S2.FaceUVToXYZ(this.face, uv);

      result.push(S2.XYZToLatLng(xyz));
    }
    return result;
  };


  S2.S2Cell.prototype.getFaceAndQuads = function() {
    const quads = pointToHilbertQuadList(this.ij[0], this.ij[1], this.level, this.face);

    return [this.face, quads];
  };
  S2.S2Cell.prototype.toHilbertQuadkey = function() {
    const quads = pointToHilbertQuadList(this.ij[0], this.ij[1], this.level, this.face);

    return this.face.toString(10) + "/" + quads.join("");
  };

  S2.latLngToNeighborKeys = S2.S2Cell.latLngToNeighborKeys = function(lat, lng, level) {
    return S2.S2Cell.FromLatLng({
      lat: lat,
      lng: lng
    }, level).getNeighbors()
      .map(function(cell) {
        return cell.toHilbertQuadkey();
      });
  };
  S2.S2Cell.prototype.getNeighbors = function() {

    const fromFaceIJWrap = function(face, ij, level) {
      const maxSize = (1 << level);
      if (ij[0] >= 0 && ij[1] >= 0 && ij[0] < maxSize && ij[1] < maxSize) {
        // no wrapping out of bounds
        return S2.S2Cell.FromFaceIJ(face, ij, level);
      } else {
        // the new i,j are out of range.
        // with the assumption that they're only a little past the borders we can just take the points as
        // just beyond the cube face, project to XYZ, then re-create FaceUV from the XYZ vector

        let st = S2.IJToST(ij, level, [0.5, 0.5]);
        let uv = S2.STToUV(st);
        const xyz = S2.FaceUVToXYZ(face, uv);
        const faceuv = S2.XYZToFaceUV(xyz);
        face = faceuv[0];
        uv = faceuv[1];
        st = S2.UVToST(uv);
        ij = S2.STToIJ(st, level);
        return S2.S2Cell.FromFaceIJ(face, ij, level);
      }
    };

    const face = this.face;
    const i = this.ij[0];
    const j = this.ij[1];
    const level = this.level;


    return [
      fromFaceIJWrap(face, [i - 1, j], level),
      fromFaceIJWrap(face, [i, j - 1], level),
      fromFaceIJWrap(face, [i + 1, j], level),
      fromFaceIJWrap(face, [i, j + 1], level)
    ];

  };

  //
  // Functional Style
  //
  S2.FACE_BITS = 3;
  S2.MAX_LEVEL = 30;
  S2.POS_BITS = (2 * S2.MAX_LEVEL) + 1; // 61 (60 bits of data, 1 bit lsb marker)

  S2.facePosLevelToId = S2.S2Cell.facePosLevelToId = S2.fromFacePosLevel = function(faceN, posS, levelN) {
    const Long = exports.dcodeIO && exports.dcodeIO.Long || require("long");
    let faceB;
    let posB;
    let bin;

    if (!levelN) {
      levelN = posS.length;
    }
    if (posS.length > levelN) {
      posS = posS.substr(0, levelN);
    }

    // 3-bit face value
    faceB = Long.fromString(faceN.toString(10), true, 10).toString(2);
    while (faceB.length < S2.FACE_BITS) {
      faceB = "0" + faceB;
    }

    // 60-bit position value
    posB = Long.fromString(posS, true, 4).toString(2);
    while (posB.length < (2 * levelN)) {
      posB = "0" + posB;
    }

    bin = faceB + posB;
    // 1-bit lsb marker
    bin += "1";
    // n-bit padding to 64-bits
    while (bin.length < (S2.FACE_BITS + S2.POS_BITS)) {
      bin += "0";
    }

    return Long.fromString(bin, true, 2).toString(10);
  };

  S2.keyToId = S2.S2Cell.keyToId = S2.toId = S2.toCellId = S2.fromKey = function(key) {
    const parts = key.split("/");

    return S2.fromFacePosLevel(parts[0], parts[1], parts[1].length);
  };

  S2.idToKey = S2.S2Cell.idToKey = S2.S2Cell.toKey = S2.toKey = S2.fromId = S2.fromCellId = S2.S2Cell.toHilbertQuadkey = S2.toHilbertQuadkey = function(idS) {
    const Long = exports.dcodeIO && exports.dcodeIO.Long || require("long");
    let bin = Long.fromString(idS, true, 10).toString(2);

    while (bin.length < (S2.FACE_BITS + S2.POS_BITS)) {
      bin = "0" + bin;
    }

    // MUST come AFTER binstr has been left-padded with '0's
    const lsbIndex = bin.lastIndexOf("1");
    // substr(start, len)
    // substring(start, end) // includes start, does not include end
    const faceB = bin.substring(0, 3);
    // posB will always be a multiple of 2 (or it's invalid)
    const posB = bin.substring(3, lsbIndex);
    const levelN = posB.length / 2;

    const faceS = Long.fromString(faceB, true, 2).toString(10);
    let posS = Long.fromString(posB, true, 2).toString(4);

    while (posS.length < levelN) {
      posS = "0" + posS;
    }

    return faceS + "/" + posS;
  };

  S2.keyToLatLng = S2.S2Cell.keyToLatLng = function(key) {
    const cell2 = S2.S2Cell.FromHilbertQuadKey(key);
    return cell2.getLatLng();
  };

  S2.idToLatLng = S2.S2Cell.idToLatLng = function(id) {
    const key = S2.idToKey(id);
    return S2.keyToLatLng(key);
  };

  S2.S2Cell.latLngToKey = S2.latLngToKey = S2.latLngToQuadkey = function(lat, lng, level) {
    if (isNaN(level) || level < 1 || level > 30) {
      throw new Error("'level' is not a number between 1 and 30 (but it should be)");
    }
    return S2.S2Cell.FromLatLng({
      lat: lat,
      lng: lng
    }, level).toHilbertQuadkey();
  };

  S2.stepKey = function(key, num) {
    const Long = exports.dcodeIO && exports.dcodeIO.Long || require("long");
    const parts = key.split("/");

    const faceS = parts[0];
    const posS = parts[1];
    const level = parts[1].length;

    const posL = Long.fromString(posS, true, 4);
    // TODO handle wrapping (0 === pos + 1)
    // (only on the 12 edges of the globe)
    let otherL;
    if (num > 0) {
      otherL = posL.add(Math.abs(num));
    } else if (num < 0) {
      otherL = posL.subtract(Math.abs(num));
    }
    let otherS = otherL.toString(4);

    if ("0" === otherS) {
      console.warning(new Error("face/position wrapping is not yet supported"));
    }

    while (otherS.length < level) {
      otherS = "0" + otherS;
    }

    return faceS + "/" + otherS;
  };

  S2.S2Cell.prevKey = S2.prevKey = function(key) {
    return S2.stepKey(key, -1);
  };

  S2.S2Cell.nextKey = S2.nextKey = function(key) {
    return S2.stepKey(key, 1);
  };

})("undefined" !== typeof module ? module.exports : window);
