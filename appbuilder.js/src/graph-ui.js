define(['text!graph-ui.css', 'text!graph-ui.html', 'ui-util'], function (graph_ui_css, graph_ui_html, ui_util) {
  var __connectionElement = null;
  var __graphElements = [];
  var __overlays = [];
  var __scrollPosition = [0, 0];
  var __lineElement = null;

  var __rootHTML = ui_util.getDomFragmentFromString(graph_ui_html);
  ui_util.attachCSSFromString(graph_ui_css);

  function createLineElement (startX, startY) {
    var element = __rootHTML.querySelector('.webmaker-appbuilder-line').cloneNode(true);
    
    var stopX = startX, stopY = startY;

    element.style.left = startX + 'px';
    element.style.top = startY + 'px';

    function render () {
      var dx = stopX - startX;
      var dy = stopY - startY;
      var h = Math.sqrt(dx*dx + dy*dy);
      var a = Math.atan2(dy, dx) * 180 / Math.PI;

      element.style.width = h + 'px';

      var t = 'rotate(' + a.toFixed(3) + 'deg)';

      element.style.transform = t;
      element.style.WebkitTransform = t;
      element.style.MozTransform = t;
    }

    function onMouseMove (e) {
      stopX = e.clientX + document.body.scrollLeft;
      stopY = e.clientY + document.body.scrollTop;
      render();
    }

    window.addEventListener('mousemove', onMouseMove, false);

    element.stop = function () {
      window.removeEventListener('mousemove', onMouseMove, false);
    };

    render();

    return element;
  }

  function createOverlayForElement (element) {
    var overlay = __rootHTML.querySelector('.webmaker-appbuilder-overlay').cloneNode(true);

    function onMouseOver (e) {
      overlay.classList.add('on');
      __connectionElement = element;
    }

    function onMouseOut (e) {
      overlay.classList.remove('on');
      __connectionElement = null;
    }

    var interval = setInterval(function () {    
      var rect = element.getBoundingClientRect();
      overlay.style.top = rect.top + document.body.scrollTop + 'px';
      overlay.style.left = rect.left + document.body.scrollLeft + 'px';
      overlay.style.width = rect.width + 'px';
      overlay.style.height = rect.height + 'px';
    }, 20);

    overlay.addEventListener('mouseover', onMouseOver, false);
    overlay.addEventListener('mouseout', onMouseOut, false);

    overlay.turnOn = function () {
      overlay.classList.add('on');
    };

    overlay.stop = function () {
      clearInterval(interval);
      overlay.removeEventListener('mouseover', onMouseOver, false);
      overlay.removeEventListener('mouseout', onMouseOut, false);
    };

    element._appbuilder.overlay = overlay;

    return overlay;
  }

  var graph_ui = {
    addElement: function (element, options) {
      options = options || {};
      options.onConnectionRequest = options.onConnectionRequest || function () {};

      __graphElements.push(element);

      function onMouseDown (mouseDownEvent) {
        if (mouseDownEvent.which !== 1) {
          return true;
        }

        var timeout = -1;
        var mouseX = mouseDownEvent.clientX, mouseY = mouseDownEvent.clientY;

        function onMouseUpBeforeTimeout (e) {
          window.removeEventListener('mouseup', onMouseUpBeforeTimeout, false);
          element.addEventListener('mousedown', onMouseDown, false);
          clearTimeout(timeout);
        }

        function onMouseUpAfterTimeout (e) {
          window.removeEventListener('mouseup', onMouseUpAfterTimeout, false);
          element.addEventListener('mousedown', onMouseDown, false);
          var connectionElement = graph_ui.stopDrawingPath();
          graph_ui.destroyOverlays();
          if (connectionElement) {
            options.onConnectionRequest(connectionElement);
          }
        }

        timeout = setTimeout(function () {
          window.removeEventListener('mouseup', onMouseUpBeforeTimeout, false);
          window.addEventListener('mouseup', onMouseUpAfterTimeout, false);
          graph_ui.createOverlays();
          graph_ui.startDrawingPath(mouseX + document.body.scrollLeft, mouseY + document.body.scrollTop);
          timeout = -1;
          mouseDownEvent.preventDefault();
          mouseDownEvent.stopPropagation();
        }, 500);

        window.addEventListener('mouseup', onMouseUpBeforeTimeout, false);
        element.removeEventListener('mousedown', onMouseDown, false);
      }

      return {
        enable: function () {
          element.addEventListener('mousedown', onMouseDown, false);
        },
        disable: function () {
          element.removeEventListener('mousedown', onMouseDown, false);
        }
      };
    },
    removeElement: function (element) {
      var idx = __graphElements.indexOf(element);
      if (idx > -1) {
        __graphElements.splice(idx, 1);
      }
    },
    createOverlays: function () {
      __graphElements.forEach(function (element) {
        var o = createOverlayForElement(element);
        document.body.appendChild(o);
        __overlays.push(o);
      });
    },
    destroyOverlays: function () {
      while (__overlays.length > 0) {
        var firstOverlay = __overlays.shift();
        firstOverlay.stop();
        firstOverlay.parentNode.removeChild(firstOverlay);
      }
    },
    createSpecificOverlay: function (element) {
      var o = createOverlayForElement(element);
      document.body.appendChild(o);
      o.classList.add('on');
      __overlays.push(o);
    },
    destroySpecificOverlay: function (overlay) {
      if (!overlay.classList.contains('webmaker-appbuilder-overlay')) {
        overlay = overlay._appbuilder.overlay;
      }
      overlay.stop();
      overlay.parentNode.removeChild(overlay);
      var idx = __overlays.indexOf(overlay);
      if (idx > -1) {
        __overlays.splice(idx, 1);
      }
    },
    startDrawingPath: function (startX, startY) {
      __lineElement = createLineElement(startX, startY);
      document.body.appendChild(__lineElement);

      var elementAtStartPoint = document.elementFromPoint(startX, startY);

      while (elementAtStartPoint && !elementAtStartPoint._appbuilder) {
        elementAtStartPoint = elementAtStartPoint.parentNode;
      }

      if (elementAtStartPoint) {
        __connectionElement = elementAtStartPoint;
        __connectionElement._appbuilder.overlay.turnOn();
      }
    },
    stopDrawingPath: function () {
      __lineElement.stop();
      document.body.removeChild(__lineElement);
      var tmpConnectionElement = __connectionElement;
      __connectionElement = null;
      return tmpConnectionElement;
    }
  };

  return graph_ui;

});
