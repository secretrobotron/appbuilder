(function() {
  var GRIDLOCK = {
    init: function () {
      var styleSheet = document.createElement('style');
      styleSheet.innerHTML = '' +
        '.GRIDLOCK {\n' +
        '  position: relative;\n' +
        '}\n' +
        '.GRIDLOCK .GRID {\n' +
        '  position: absolute;\n' +
        '  top: 0;\n' +
        '  left: 0;\n' +
        '  width: 100%;\n' +
        '  height: 100%;\n' +
        '}\n' +
        '.GRIDLOCK .CELL {\n' +
        '  position: absolute;\n' +
        '  border: 1px solid transparent;\n' +
        '  display: block;\n' +
        '  -webkit-user-select: none;\n' +
        '     -moz-user-select: none;\n' +
        '      -ms-user-select: none;\n' +
        '          user-select: none;\n' +
        '}\n' +
        '.GRIDLOCK .CELL.on {\n' +
        '  border: 1px solid #fff;\n' +
        '  background: rgba(200, 200, 255, 0.9);\n' +
        '}\n' +
        '';
      document.head.appendChild(styleSheet);
    },
    create: function (parentElement, gridSizeX, gridSizeY, numX, numY) {
      var _cells = [];

      var rect = parentElement.getBoundingClientRect();
      numX = numX || rect.width / gridSizeX;
      numY = numY || rect.height / gridSizeY;

      parentElement.classList.add('GRIDLOCK');

      var grid = document.createElement('div');
      grid.classList.add('GRID');
      parentElement.appendChild(grid);

      var cell;

      for (var i = 0; i < numX; ++i) {
        for (var j = 0; j < numY; ++j) {
          cell = document.createElement('div');
          cell.classList.add('CELL');
          cell.style.left = i * gridSizeX + 1 + 'px';
          cell.style.top = j * gridSizeY + 1 + 'px';
          cell.style.width = gridSizeX + 'px';
          cell.style.height = gridSizeY + 'px';
          grid.appendChild(cell);
          _cells.push(cell);
        }
      }

      function isCellCovered (cellRect, elementRect) {
        return elementRect.top < cellRect.bottom && elementRect.top + elementRect.height > cellRect.top &&
          elementRect.left < cellRect.right && elementRect.left + elementRect.width > cellRect.left;
      }

      return {
        reset: function () {
          _cells.forEach(function (cell) {
            cell.classList.remove('on');
          });
        },
        evaluate: function (element) {
          var elementRect = element.getBoundingClientRect();
          var coveredRect = {top: 100000, bottom: 0, left: 1000000, right: 0};
          _cells.forEach(function (cell) {
            var cellRect = cell.getBoundingClientRect();
            if (isCellCovered(cellRect, elementRect)) {
              coveredRect.top = Math.min(cellRect.top, coveredRect.top);
              coveredRect.bottom = Math.max(cellRect.bottom, coveredRect.bottom);
              coveredRect.left = Math.min(cellRect.left, coveredRect.left);
              coveredRect.right = Math.max(cellRect.right, coveredRect.right);
            }
          });

          var dl = elementRect.left - coveredRect.left;
          var dr = coveredRect.right - elementRect.right;
          var dt = elementRect.top - coveredRect.top;
          var db = coveredRect.bottom - elementRect.bottom;
          
          var x = dl < dr ? coveredRect.left : coveredRect.right - elementRect.width;
          var y = dt < db ? coveredRect.top : coveredRect.bottom - elementRect.height;

          var gridRect = grid.getBoundingClientRect();
          x = x - gridRect.left;
          y = y - gridRect.top;



          return {x: x, y: y};
        },
        project: function (element) {
          var elementRect = element.getBoundingClientRect();
          _cells.forEach(function (cell) {
            var cellRect = cell.getBoundingClientRect();
            isCellCovered(cellRect, elementRect) ? cell.classList.add('on') : cell.classList.remove('on');
          });
        }
      }
    }
  };
  window.GRIDLOCK = GRIDLOCK;
})();