(function () {
  var __GID = 0;

  function main() {

    var sandboxToolbar = document.body.querySelector('#sandbox-toolbar');

    var componentToolbar = sandboxToolbar.querySelector('#component-toolbar');
    var propertiesToolbar = sandboxToolbar.querySelector('#properties-toolbar');
    var componentToolbarItemTemplate = componentToolbar.querySelector('.component-toolbar-item');
    var propertiesToolbarItemTemplate = propertiesToolbar.querySelector('.properties-toolbar-item');
    var phoneContainerArea = document.body.querySelector('#phone-container');

    propertiesToolbarItemTemplate.parentNode.removeChild(propertiesToolbarItemTemplate);

    var modeSwitchFunctions = {
      edit: function () {
        appbuilder.switchMode('inactive');
        appbuilder.forEachElement(function (element) {
          $(element).draggable('disable');
          element.addEventListener('click', onElementClickInEditMode, false);
        });
        componentToolbar.hidden = true;
        propertiesToolbar.hidden = false;
      },
      connect: function () {
        appbuilder.switchMode('connect');
        appbuilder.forEachElement(function (element) {
          $(element).draggable('disable');
          element.removeEventListener('click', onElementClickInEditMode, false);
        });
        componentToolbar.hidden = true;
        propertiesToolbar.hidden = true;
      },
      layout: function () {
        appbuilder.switchMode('inactive');
        appbuilder.forEachElement(function (element) {
          $(element).draggable('enable');
          element.removeEventListener('click', onElementClickInEditMode, false);
        });
        componentToolbar.hidden = false;
        propertiesToolbar.hidden = true;
      },
      play: function () {
        appbuilder.switchMode('interactive');
        appbuilder.forEachElement(function (element) {
          $(element).draggable('disable');
          element.removeEventListener('click', onElementClickInEditMode, false);
        });
        componentToolbar.hidden = true;
        propertiesToolbar.hidden = true;
      }
    };

    Array.prototype.forEach.call(sandboxToolbar.querySelectorAll('input[name="mode"]'), function (inputElement) {
      inputElement.addEventListener('click', function (e) {
        if (inputElement.checked) {
          modeSwitchFunctions[inputElement.value]();
        }
      }, false);
    });

    GRIDLOCK.init();

    var gridlock = GRIDLOCK.create(phoneContainerArea, 25, 25);

    var currentDraggingElement;
    var isOverPhoneArea = false;

    function onElementClickInEditMode (e) {
      var element = e.currentTarget;
      var editorContainer = element.querySelector('*[data-editor]');
      if (editorContainer && element._appbuilder.edit) {
        editorContainer.hidden = false;
        element._appbuilder.edit(function (){
          editorContainer.hidden = true;
        });
      }
    }

    function initToolbarElement (element) {
      $(element).draggable({
        helper: 'clone',
        appendTo: 'body',
        drag: function (e, ui) {
          if (isOverPhoneArea) {
            gridlock.project(ui.helper[0]);
          }
        },
        start: function (e, ui) {
          $(phoneContainerArea).droppable('enable');
          currentDraggingElement = element;
          var definition = currentDraggingElement._definition;
          if (definition) {
            ui.helper[0].style.width = definition.dimensions.width + 'px';
            ui.helper[0].style.height = definition.dimensions.height + 'px';
          }
          else {
            var rect = element.getBoundingClientRect();
            ui.helper[0].style.width = rect.width + 'px';
            ui.helper[0].style.height = rect.height + 'px';
          }
          sandboxToolbar.hidden = true;
        },
        stop: function (e, ui) {
          $(phoneContainerArea).droppable('disable');
          sandboxToolbar.hidden = false;
        },
        cancel: false
      });
    }

    if (appbuilder.environment.noWebComponents) {
      appbuilder.environment.registerExistingFFOSComponents(function (element) {
        element.setAttribute('data-appbuilder-thumbnail', true);
        initToolbarElement(element);
      });
    }
    else {
      componentToolbarItemTemplate.parentNode.removeChild(componentToolbarItemTemplate);

      appbuilder.environment.getComponents(function (list) {
        var newTags = [];
        var instances = [];

        list.forEach(function (definition) {
          var componentListItem = componentToolbarItemTemplate.cloneNode(true);
          var componentInstance = document.createElement(definition.name);
          componentListItem.appendChild(componentInstance);
          componentToolbar.appendChild(componentListItem);

          componentInstance.setAttribute('data-appbuilder-thumbnail', true);
          componentInstance._definition = definition;

          var linkTag = document.createElement('link');
          linkTag.rel = 'import';
          linkTag.href = definition.url;
          document.head.appendChild(linkTag);
          
          instances.push(componentInstance);
          newTags.push(linkTag);
        });

        // FORCE CustomElements to reparse :/ hack hack hack hack hack        
        HTMLImports.importer.loader(function () {
          document.__importParsed = false;
          document.__parsed = false;
          HTMLImports.parser.parse(document);
          CustomElements.parser.parse(document);
          instances.forEach(initToolbarElement);
        }).addNodes(newTags);
      });
    }

    $(phoneContainerArea).droppable({
      over: function (e, ui) {
        isOverPhoneArea = true;
      },
      out: function (e, ui) {
        isOverPhoneArea = false;
      },
      drop: function (e, ui) {
        if (currentDraggingElement) {
          var position = gridlock.evaluate(ui.helper[0]);

          // Get rid of demo mode within webcomponent.
          // Helper is thrown away here, so its state doesn't matter anymore.
          ui.helper[0].removeAttribute('data-appbuilder-thumbnail');
          ui.helper[0].id = ui.helper[0].localName + __GID++;

          var newElement = ui.helper[0].cloneNode(true);
          newElement.style.left = position.x + 'px';
          newElement.style.top = position.y + 'px';
          phoneContainerArea.appendChild(newElement);

          Array.prototype.forEach.call(newElement.querySelectorAll('[contenteditable]'), function (editableElement) {
            editableElement.addEventListener('dblclick', function (e) {
              $(newElement).draggable('disable');
            }, false);
            editableElement.addEventListener('blur', function (e) {
              $(newElement).draggable('enable');
            }, false);
            editableElement.addEventListener('change', function (e) {
              $(newElement).draggable('enable');
            }, false);
          });

          $(newElement).draggable({
            drag: function (e, ui) {
              gridlock.project(newElement);
            },
            start: function (e, ui) {
            },
            stop: function (e, ui) {
              var position = gridlock.evaluate(newElement);
              newElement.style.left = position.x + 'px';
              newElement.style.top = position.y + 'px';
              gridlock.clear();
            },
            cancel: false
          });

          if (appbuilder.environment.noWebComponents) {
            appbuilder.environment.initFFOSComponent(newElement);
          }
        }
        gridlock.clear();
      }
    });

    function onAppbuilderLoaded (e) {
      window.removeEventListener('appbuilderloaded', onAppbuilderLoaded, false);
      document.querySelector('#layout-mode-radio').checked = true;
      document.querySelector('#connect-mode-radio').checked = false;
      document.querySelector('#play-mode-radio').checked = false;
      modeSwitchFunctions.layout();
    }

    if (window.appbuilder) {
      appbuilder.ready(onAppbuilderLoaded)
    }
    else {
      window.addEventListener('appbuilderloaded', onAppbuilderLoaded, false);
    }
  }

  document.addEventListener('readystatechange', function (e) {
    // Make sure everything is loaded. For real. Really.
    if (document.readyState !== 'complete') {
      return;
    }

    // NEED this hack because jquery ruins platform somehow.
    var s = document.createElement('script');
    s.src = '/vendor/jquery-ui-1.10.3.custom.js';
    s.onload = function () {
      // stop jqueryui from complaining about not being initialized yet
      setTimeout(function () {
        main();
      }, 100);
    };
    document.head.appendChild(s);
  }, false);

})();