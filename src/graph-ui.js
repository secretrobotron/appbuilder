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

    overlay.stop = function () {
      clearInterval(interval);
      overlay.removeEventListener('mouseover', onMouseOver, false);
      overlay.removeEventListener('mouseout', onMouseOut, false);
    };

    element._appbuilder.overlay = overlay;

    return overlay;
  }

  return {
    addElement: function (element) {
      __graphElements.push(element);
    },
    removeElement: function (element) {
      var idx = __graphElements.indexOf(element);
      if (idx > -1) {
        __graphElements.slice(idx, 1);
      }
    },
    turnOnOverlays: function (ignoreElement) {
      __graphElements.forEach(function (element) {
        if (!ignoreElement || ignoreElement !== element) {
          var o = createOverlayForElement(element);
          document.body.appendChild(o);
          __overlays.push(o);
        }
      });
    },
    turnOffOverlays: function () {
      while (__overlays.length > 0) {
        __overlays[0].stop();
        __overlays[0].parentNode.removeChild(__overlays.shift());
      }
    },
    turnOnSpecificOverlay: function (element) {
      var o = createOverlayForElement(element);
      document.body.appendChild(o);
      o.classList.add('on');
      __overlays.push(o);
    },
    turnOffSpecificOverlay: function (overlay) {
      if (!overlay.classList.contains('webmaker-appbuilder-overlay')) {
        overlay = overlay._appbuilder.overlay;
      }
      overlay.stop();
      overlay.parentNode.removeChild(overlay);
      var idx = __overlays.indexOf(overlay);
      if (idx > -1) {
        __overlays.slice(idx, 1);
      }
    },
    startDrawingPath: function (startX, startY) {
      __lineElement = createLineElement(startX, startY);
      document.body.appendChild(__lineElement);
    },
    stopDrawingPath: function () {
      __lineElement.stop();
      document.body.removeChild(__lineElement);
      return __connectionElement;
    }
  };

});
