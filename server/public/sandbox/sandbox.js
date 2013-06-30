(function () {
  
  document.addEventListener('DOMContentLoaded', function (e) {
    var componentToolbar = document.querySelector('#component-toolbar');
    var componentToolbarItemTemplate = componentToolbar.querySelector('.component-toolbar-item');
    var phoneContainerArea = document.querySelector('#phone-container');

    componentToolbarItemTemplate.parentNode.removeChild(componentToolbarItemTemplate);

    appbuilder.environment.getComponents(function (list) {
      var newTags = [];
      var instances = [];

      list.forEach(function (definition) {
        var componentListItem = componentToolbarItemTemplate.cloneNode(true);
        var componentInstance = document.createElement(definition.name);
        componentListItem.appendChild(componentInstance);
        componentToolbar.appendChild(componentListItem);

        componentInstance.setAttribute('data-thumbnail-only', true);

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
        instances.forEach(function (instance) {
          $(instance).draggable({
            helper: 'clone',
            start: function (e, ui) {
              var rect = instance.getBoundingClientRect();
              ui.helper[0].style.width = rect.width + 'px';
              ui.helper[0].style.height = rect.height + 'px';
            },
            cancel: false
          });
        });

        $(phoneContainerArea).droppable({
          activeClass: 'droppable-over'
        });

      }).addNodes(newTags);

    });
  }, false);

})();