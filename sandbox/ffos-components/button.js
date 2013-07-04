appbuilder.environment.defineFFOSComponent('appbuilder-button', function () {
  var thisElement = this;

  var button = this.querySelector('button');
  var disabled = thisElement.classList.contains('disabled');

  function initAppbuilder (e) {
    window.removeEventListener('appbuilderloaded', initAppbuilder, false);
    appbuilder.initElement(thisElement, {
      inputs: {
        click: {
          type: 'event',
          description: 'trigger {{name}}'
        },
        enable: {
          type: 'event',
          description: 'enable {{name}}'
        },
        disable: {
          type: 'event',
          description: 'disable {{name}}'
        }
      },
      outputs: {
        click: {
          type: 'event',
          description: '{{name}} is clicked'
        }
      },
      modes: {
        layout: function () {

        },
        interactive: function () {

        }
      }
    });
    
    thisElement._appbuilder.onInput('enable', function () {
      disabled = false;
      thisElement.classList.remove('disabled');
    });

    thisElement._appbuilder.onInput('disable', function () {
      disabled = true;
      thisElement.classList.add('disabled');
    });

    thisElement.addEventListener('click', function (e) {
      if (!disabled) {
        thisElement._appbuilder.sendOutput('click');
      }
    }, false);
  }

  if (!thisElement.getAttribute('data-appbuilder-thumbnail')) {
    if (!window.appbuilder) {
      window.addEventListener('appbuilderloaded', initAppbuilder, false);
    }
    else {
      initAppbuilder();
    }
  }
  else {
    button.contentEditable = false;
  }
});