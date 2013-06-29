window.addEventListener('appbuilderloaded', function (e) {
  var rollElement = document.querySelector('#roll');
  appbuilder.initElement(rollElement, {
    states: {
      isEmpty: true,
      hasPictures: false
    },
    inputs: {
      insertPicture: {
        type: 'image',
        description: 'store the image in {{name}}'
      },
      createGif: {
        type: 'event',
        description: 'create a GIF from the images in {{name}}'
      },
      clear: {
        type: 'event',
        description: 'clear {{name}}'
      }
    },
    outputs: {
      gifCreated: {
        type: 'image',
        description: 'a GIF was created'
      },
      hasPictures: {
        type: 'event',
        description: 'contains pictures'
      },
      isEmpty: {
        type: 'event',
        description: 'is empty'
      }
    }
  });

  rollElement._appbuilder.onInput('insertPicture', function(canvas) {
    if (rollElement.firstChild) {
      rollElement.insertBefore(canvas, rollElement.firstChild);
    } else {
      rollElement.appendChild(canvas);
    }

    var canvasElements = rollElement.querySelectorAll('canvas');
    if (canvasElements.length > 0) {
      rollElement._appbuilder.sendOutput('hasPictures', canvasElements);
      rollElement._appbuilder.states['isEmpty'] = false;
      rollElement._appbuilder.states['hasPictures'] = true;
    }
  });

  rollElement._appbuilder.onInput('createGif', function () {
    var gif = new GIF({
      workers: 2,
      workerScript: 'lib/gif.worker.js',
      quality: 10
    });

    var canvasElements = Array.prototype.slice.call(rollElement.querySelectorAll('canvas')).reverse();
    canvasElements.forEach(function (canvas) {
      gif.addFrame(canvas, {delay: 100});
    });

    gif.on('finished', function(blob) {
      var img = document.createElement('img');
      img.src = URL.createObjectURL(blob);
      rollElement._appbuilder.sendOutput('gifCreated', img);
    });

    gif.render();          
  });

  rollElement._appbuilder.onInput('clear', function () {
    while(rollElement.firstChild) {
      rollElement.removeChild(rollElement.firstChild);
    }
    rollElement._appbuilder.sendOutput('isEmpty');
    rollElement._appbuilder.states['isEmpty'] = true;
    rollElement._appbuilder.states['hasPictures'] = false;
  });

  appbuilder.updateStateListenersOnConnect(rollElement._appbuilder);
}, false);