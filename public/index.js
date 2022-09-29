/*
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

var DataDB;
async function loadData() {
  const res = await fetch(
    "https://fbase-lienzo-anden-default-rtdb.firebaseio.com/data.json"
    
  );
  DataDB = await res.json();
  DataDB.linkHotspots = [];

  init();
}

function init() {
  var Marzipano = window.Marzipano;
  var bowser = window.bowser;
  var screenfull = window.screenfull;
  var data = window.DataDB;

  // Grab elements from DOM.
  var panoElement = document.querySelector('#pano');
  var sceneNameElement = document.querySelector('#titleBar .sceneName');
  var sceneListElement = document.querySelector('#sceneList');
  var sceneElements = document.querySelectorAll('#sceneList .scene');
  var sceneListToggleElement = document.querySelector('#sceneListToggle');
  var autorotateToggleElement = document.querySelector('#autorotateToggle');
  var fullscreenToggleElement = document.querySelector('#fullscreenToggle');

  // Detect desktop or mobile mode.
  if (window.matchMedia) {
    var setMode = function() {
      if (mql.matches) {
        document.body.classList.remove('desktop');
        document.body.classList.add('mobile');
      } else {
        document.body.classList.remove('mobile');
        document.body.classList.add('desktop');
      }
    };
    var mql = matchMedia("(max-width: 500px), (max-height: 500px)");
    setMode();
    mql.addListener(setMode);
  } else {
    document.body.classList.add('desktop');
  }

  // Detect whether we are on a touch device.
  document.body.classList.add('no-touch');
  window.addEventListener('touchstart', function() {
    document.body.classList.remove('no-touch');
    document.body.classList.add('touch');
  });

  // Use tooltip fallback mode on IE < 11.
  if (bowser.msie && parseFloat(bowser.version) < 11) {
    document.body.classList.add('tooltip-fallback');
  }

  // Viewer options.
  var viewerOpts = {
    controls: {
      mouseViewMode: data.settings.mouseViewMode
    }
  };

  // Initialize viewer.
  var viewer = new Marzipano.Viewer(panoElement, viewerOpts);

  // Create scenes.
  var scenes = data.scenes.map(function(data) {
    var urlPrefix = "tiles";
    var source = Marzipano.ImageUrlSource.fromString(
      urlPrefix + "/" + data.id + "/{z}/{f}/{y}/{x}.jpg",
      { cubeMapPreviewUrl: urlPrefix + "/" + data.id + "/preview.jpg" });
    var geometry = new Marzipano.CubeGeometry(data.levels);

    var limiter = Marzipano.RectilinearView.limit.traditional(data.faceSize, 100*Math.PI/180, 120*Math.PI/180);
    var view = new Marzipano.RectilinearView(data.initialViewParameters, limiter);

    var scene = viewer.createScene({
      source: source,
      geometry: geometry,
      view: view,
      pinFirstLevel: true
    });

    // Create info hotspots.
    data.infoHotspots.forEach(function(hotspot) {
      var element = createModal(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });

    return {
      data: data,
      scene: scene,
      view: view
    };
  });

  // Set up autorotate, if enabled.
  var autorotate = Marzipano.autorotate({
    yawSpeed: 0.03,
    targetPitch: 0,
    targetFov: Math.PI/2
  });
  if (data.settings.autorotateEnabled) {
    autorotateToggleElement.classList.add('enabled');
  }

  // Set handler for autorotate toggle.
  autorotateToggleElement.addEventListener('click', toggleAutorotate);

  // Set up fullscreen mode, if supported.
  if (screenfull.enabled && data.settings.fullscreenButton) {
    document.body.classList.add('fullscreen-enabled');
    fullscreenToggleElement.addEventListener('click', function() {
      screenfull.toggle();
    });
    screenfull.on('change', function() {
      if (screenfull.isFullscreen) {
        fullscreenToggleElement.classList.add('enabled');
      } else {
        fullscreenToggleElement.classList.remove('enabled');
      }
    });
  } else {
    document.body.classList.add('fullscreen-disabled');
  }

  // Set handler for scene list toggle.
  sceneListToggleElement.addEventListener('click', toggleSceneList);

  // Start with the scene list open on desktop.
  if (!document.body.classList.contains('mobile')) {
    showSceneList();
  }

  // Set handler for scene switch.
  scenes.forEach(function(scene) {
    var el = document.querySelector('#sceneList .scene[data-id="' + scene.data.id + '"]');
    el.addEventListener('click', function() {
      switchScene(scene);
      // On mobile, hide scene list after selecting a scene.
      if (document.body.classList.contains('mobile')) {
        hideSceneList();
      }
    });
  });

  // DOM elements for view controls.
  var viewUpElement = document.querySelector('#viewUp');
  var viewDownElement = document.querySelector('#viewDown');
  var viewLeftElement = document.querySelector('#viewLeft');
  var viewRightElement = document.querySelector('#viewRight');
  var viewInElement = document.querySelector('#viewIn');
  var viewOutElement = document.querySelector('#viewOut');

  // Dynamic parameters for controls.
  var velocity = 0.7;
  var friction = 3;

  // Associate view controls with elements.
  var controls = viewer.controls();
  controls.registerMethod('upElement',    new Marzipano.ElementPressControlMethod(viewUpElement,     'y', -velocity, friction), true);
  controls.registerMethod('downElement',  new Marzipano.ElementPressControlMethod(viewDownElement,   'y',  velocity, friction), true);
  controls.registerMethod('leftElement',  new Marzipano.ElementPressControlMethod(viewLeftElement,   'x', -velocity, friction), true);
  controls.registerMethod('rightElement', new Marzipano.ElementPressControlMethod(viewRightElement,  'x',  velocity, friction), true);
  controls.registerMethod('inElement',    new Marzipano.ElementPressControlMethod(viewInElement,  'zoom', -velocity, friction), true);
  controls.registerMethod('outElement',   new Marzipano.ElementPressControlMethod(viewOutElement, 'zoom',  velocity, friction), true);

  function sanitize(s) {
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;');
  }

  function switchScene(scene) {
    stopAutorotate();
    scene.view.setParameters(scene.data.initialViewParameters);
    scene.scene.switchTo();
    startAutorotate();
    updateSceneName(scene);
    updateSceneList(scene);
  }

  function updateSceneName(scene) {
    sceneNameElement.innerHTML = sanitize(scene.data.name);
  }

  function updateSceneList(scene) {
    for (var i = 0; i < sceneElements.length; i++) {
      var el = sceneElements[i];
      if (el.getAttribute('data-id') === scene.data.id) {
        el.classList.add('current');
      } else {
        el.classList.remove('current');
      }
    }
  }

  function showSceneList() {
    sceneListElement.classList.add('enabled');
    sceneListToggleElement.classList.add('enabled');
  }

  function hideSceneList() {
    sceneListElement.classList.remove('enabled');
    sceneListToggleElement.classList.remove('enabled');
  }

  function toggleSceneList() {
    sceneListElement.classList.toggle('enabled');
    sceneListToggleElement.classList.toggle('enabled');
  }

  function startAutorotate() {
    if (!autorotateToggleElement.classList.contains('enabled')) {
      return;
    }
    viewer.startMovement(autorotate);
    viewer.setIdleMovement(3000, autorotate);
  }

  function stopAutorotate() {
    viewer.stopMovement();
    viewer.setIdleMovement(Infinity);
  }

  function toggleAutorotate() {
    if (autorotateToggleElement.classList.contains('enabled')) {
      autorotateToggleElement.classList.remove('enabled');
      stopAutorotate();
    } else {
      autorotateToggleElement.classList.add('enabled');
      startAutorotate();
    }
  }

  function createModal(hotspot) {

    // Create wrapper element to hold icon and tooltip.
    var wrapper = document.createElement("div");
    wrapper.classList.add("hotspot");
    wrapper.classList.add("info-hotspot");

    // Create image element.
    var iconWrapper = document.createElement("div");
    iconWrapper.classList.add("info-hotspot-icon-wrapper");
    var icon = document.createElement("img");

    try {
      icon.src = `img/icons/manzanas/${hotspot.manzana.toLowerCase()}/${hotspot.manzana.toLowerCase()}-${
        hotspot.lote
      }.png`;
    } catch (_) {
      icon.src = "img/info.png";
    }

    switch (hotspot.estado) {
      case "vendido":
        iconWrapper.classList.add("info-hotspot-icon-wrapper-vendido");
        break;
      case "reservado":
        iconWrapper.classList.add("info-hotspot-icon-wrapper-reservado");
        break;
      case "disponible":
        iconWrapper.classList.add("info-hotspot-icon-wrapper-disponible");
        break;
      default:
        iconWrapper.classList.add("info-hotspot-icon-wrapper-nodisponible");
        break;
    }
    icon.classList.add("info-hotspot-icon");
    iconWrapper.appendChild(icon);

    // Create Lote Header

    var stateInfo = document.createElement("div");
    stateInfo.classList.add("state-info");
    var stateText = document.createElement("span");
    stateText.classList.add("state-text");
    stateText.innerText = hotspot.estado;
    var bulletState = document.createElement("div");
    bulletState.classList.add("bullet-state");

    // Create title element.
    var titleWrapper = document.createElement("div");
    titleWrapper.classList.add("info-hotspot-title-wrapper");
    var title = document.createElement("div");
    title.classList.add("info-hotspot-title");
    title.innerHTML = hotspot.title;
    titleWrapper.appendChild(title);

    wrapper.appendChild(iconWrapper);

    // wrapper.appendChild(text);

    // Create a modal for the hotspot content to appear on mobile mode.
    var modal = document.createElement("div");
    var button_link = document.createElement("a");

    let longitudIzquierda = 0.0;
    let longitudDerecha = 0.0;
    let longitudFondo = 0.0;
    let longitudFrente = 0.0;
    hotspot.izquierda.forEach(value => {
      longitudIzquierda += value;
      longitudIzquierda = Math.round(longitudIzquierda * 100) / 100;
    });
    hotspot.derecha.forEach(value => {
      longitudDerecha += value;
      longitudDerecha = Math.round(longitudDerecha * 100) / 100;
    });
    hotspot.fondo.forEach(value => {
      longitudFondo += value;
      longitudFondo = Math.round(longitudFondo * 100) / 100;
    });
    hotspot.frente.forEach(value => {
      longitudFrente += value;
      longitudFrente = Math.round(longitudFrente * 100) / 100;
    });
    let perimetro = longitudIzquierda + longitudDerecha + longitudFondo + longitudFrente;

    switch (hotspot.estado) {
    case "disponible":
      //
      var header_top = document.createElement("div");
      header_top.classList.add("header-top");
      //
      var modal_wraper = document.createElement("div");
      modal_wraper.classList.add("modal-wraper");
      var col1 = document.createElement("div");
      col1.classList.add("col");
      var wraper_disponibilidad = document.createElement("div");
      wraper_disponibilidad.classList.add("modal-wraper_disponibilidad");
      var disp_lote = document.createElement("p");
      disp_lote.innerHTML = `${hotspot.manzana} ${hotspot.lote}`;
      var disp_estado = document.createElement("div");
      disp_estado.classList.add("disponiblidad_indicator");
      var disp_indicator_icon = document.createElement("img");
      disp_indicator_icon.src = "img/icons/icon_green.svg";
      var disp_indicator_text = document.createElement("p");
      disp_indicator_text.innerHTML = "DISPONIBLE";
      disp_estado.appendChild(disp_indicator_icon);
      disp_estado.appendChild(disp_indicator_text);
      wraper_disponibilidad.appendChild(disp_lote);
      wraper_disponibilidad.appendChild(disp_estado);

      var wrapper_area = document.createElement("div");
      wrapper_area.classList.add("modal-wrapper_area");
      var area_title = document.createElement("p");
      area_title.classList.add("modal-wrapper_area_title");
      area_title.innerHTML = "Área de terreno";
      var area_text = document.createElement("p");
      area_text.classList.add("modal-wrapper_area_detail");
      area_text.innerHTML = `${hotspot.area} m²`;
      wrapper_area.appendChild(area_title);
      wrapper_area.appendChild(area_text);

      var wrapper_perimetro = document.createElement("div");
      wrapper_perimetro.classList.add("modal-wrapper_perimetro");
      var perimetro_title = document.createElement("p");
      perimetro_title.innerHTML = "Perímetro";
      var perimetro_text = document.createElement("p");

      
      perimetro = Math.round(perimetro);
      perimetro_text.innerHTML = `${perimetro} ml`;
      wrapper_perimetro.appendChild(perimetro_title);
      wrapper_perimetro.appendChild(perimetro_text);

      var wrapper_button = document.createElement("div");
      wrapper_button.classList.add("modal-wrapper_button");
      button_link.innerHTML = "CONSULTAR PRECIO";
      wrapper_button.appendChild(button_link);

      col1.appendChild(wraper_disponibilidad);
      col1.appendChild(wrapper_area);
      col1.appendChild(wrapper_perimetro);
      col1.appendChild(wrapper_button);

      var col2 = document.createElement("div");
      col2.classList.add("col");
      col2.classList.add("col2");

      var wrapper_text1 = document.createElement("div");
      wrapper_text1.classList.add("col2_text1");
      var text1 = document.createElement("p");

      text1.innerHTML = `Izquierda ${longitudIzquierda} m`;
      wrapper_text1.appendChild(text1);

      var wrapper_text2 = document.createElement("div");
      wrapper_text2.classList.add("col2_text2");
      var text_fondo = document.createElement("p");
      text_fondo.innerHTML = `Fondo ${longitudFondo} m`;
      var img_lote = document.createElement("img");
      let manzana = hotspot.manzana.toLowerCase();
      img_lote.src = `img/land-shape/${manzana}/${manzana}${hotspot.lote}.svg`;
      var text_frente = document.createElement("p");
      text_frente.innerHTML = `Frente ${longitudFrente} m`;
      wrapper_text2.appendChild(text_fondo);
      wrapper_text2.appendChild(img_lote);
      wrapper_text2.appendChild(text_frente);

      var wrapper_text3 = document.createElement("div");
      wrapper_text3.classList.add("col2_text3");
      var text_derecha = document.createElement("p");
      text_derecha.innerHTML = `Derecha ${longitudDerecha} m`;
      wrapper_text3.appendChild(text_derecha);

      col2.appendChild(wrapper_text1);
      col2.appendChild(wrapper_text2);
      col2.appendChild(wrapper_text3);

      modal_wraper.appendChild(col1);
      modal_wraper.appendChild(col2);

      var header_wrapper = document.createElement("div");
      header_wrapper.classList.add("header-wrapper");
      var header_wrapper_icon = document.createElement("div");
      header_wrapper_icon.classList.add("header-wrapper_icon");
      var header_wrapper_icon_img = document.createElement("img");
      header_wrapper_icon_img.src = "img/icons/icon_close.svg";
      header_wrapper_icon.appendChild(header_wrapper_icon_img);

      header_wrapper.appendChild(header_wrapper_icon);

      modal.appendChild(header_top);
      modal.appendChild(modal_wraper);
      modal.appendChild(header_wrapper);
      break;
    case "reservado":
      ///
      var header_top_reservado = document.createElement("div");
      header_top_reservado.classList.add("header-top_reservado");

      //
      var modal_wraper_reservado = document.createElement("div");
      modal_wraper_reservado.classList.add("modal-wraper_reservado");
      var col1_reservado = document.createElement("div");
      col1_reservado.classList.add("col");
      var wraper_disponibilidad = document.createElement("div");
      wraper_disponibilidad.classList.add(
        "modal-wraper_disponibilidad_reservado"
      );
      var disp_lote = document.createElement("p");
      disp_lote.innerHTML = `${hotspot.manzana} ${hotspot.lote}`;
      var disp_estado = document.createElement("div");
      disp_estado.classList.add("disponiblidad_indicator_reservado");
      var disp_indicator_icon = document.createElement("img");
      disp_indicator_icon.src = "img/icons/icon_reservado.svg";
      var disp_indicator_text = document.createElement("p");
      disp_indicator_text.innerHTML = "RESERVADO";
      disp_estado.appendChild(disp_indicator_icon);
      disp_estado.appendChild(disp_indicator_text);
      wraper_disponibilidad.appendChild(disp_lote);
      wraper_disponibilidad.appendChild(disp_estado);

      var wrapper_area = document.createElement("div");
      wrapper_area.classList.add("modal-wrapper_area");
      var area_title = document.createElement("p");
      area_title.classList.add("modal-wrapper_area_title");
      area_title.innerHTML = "Área de terreno";
      var area_text = document.createElement("p");
      area_text.classList.add("modal-wrapper_area_detail");
      area_text.classList.add("text-right");
      area_text.innerHTML = "300.00 m²";
      wrapper_area.appendChild(area_title);
      wrapper_area.appendChild(area_text);

      var wrapper_perimetro_reservado = document.createElement("div");
      wrapper_perimetro_reservado.classList.add(
        "modal-wrapper_perimetro_reservado"
      );
      var perimetro_title = document.createElement("p");
      perimetro_title.innerHTML = "Perímetro";
      var perimetro_text = document.createElement("p");
      perimetro_text.classList.add("text-right");
      perimetro_text.innerHTML = "721.72 ml";
      wrapper_perimetro_reservado.appendChild(perimetro_title);
      wrapper_perimetro_reservado.appendChild(perimetro_text);

      var wrapper_button = document.createElement("div");
      wrapper_button.classList.add("modal-wrapper_not_available");
      var not_available_text = document.createElement("p");
      not_available_text.innerHTML = "ESTE TERRENO NO ESTÁ DISPONIBLE";

      wrapper_button.appendChild(not_available_text);

      col1_reservado.appendChild(wraper_disponibilidad);
      col1_reservado.appendChild(wrapper_area);
      col1_reservado.appendChild(wrapper_perimetro_reservado);
      col1_reservado.appendChild(wrapper_button);

      modal_wraper_reservado.appendChild(col1_reservado);

      var header_wrapper = document.createElement("div");
      header_wrapper.classList.add("header-wrapper");
      var header_wrapper_icon = document.createElement("div");
      header_wrapper_icon.classList.add("header-wrapper_icon");
      var header_wrapper_icon_img = document.createElement("img");
      header_wrapper_icon_img.src = "img/icons/icon_close.svg";
      header_wrapper_icon.appendChild(header_wrapper_icon_img);

      header_wrapper.appendChild(header_wrapper_icon);

      modal.appendChild(header_top_reservado);
      modal.appendChild(modal_wraper_reservado);
      modal.appendChild(header_wrapper);

      modal.classList.add("modal_reservado");
      break;
    case "vendido":
      ///
      var header_top_reservado = document.createElement("div");
      header_top_reservado.classList.add("header-top_vendido");

      //
      var modal_wraper_reservado = document.createElement("div");
      modal_wraper_reservado.classList.add("modal-wraper_reservado");
      var col1_reservado = document.createElement("div");
      col1_reservado.classList.add("col");
      var wraper_disponibilidad = document.createElement("div");
      wraper_disponibilidad.classList.add(
        "modal-wraper_disponibilidad_reservado"
      );
      var disp_lote = document.createElement("p");
      disp_lote.innerHTML = `${hotspot.manzana} ${hotspot.lote}`;
      var disp_estado = document.createElement("div");
      disp_estado.classList.add("disponiblidad_indicator_vendido");
      var disp_indicator_icon = document.createElement("img");
      disp_indicator_icon.src = "img/icons/icon_vendido.svg";
      var disp_indicator_text = document.createElement("p");
      disp_indicator_text.innerHTML = "VENDIDO";
      disp_estado.appendChild(disp_indicator_icon);
      disp_estado.appendChild(disp_indicator_text);
      wraper_disponibilidad.appendChild(disp_lote);
      wraper_disponibilidad.appendChild(disp_estado);

      var wrapper_area = document.createElement("div");
      wrapper_area.classList.add("modal-wrapper_area");
      var area_title = document.createElement("p");
      area_title.classList.add("modal-wrapper_area_title");
      area_title.innerHTML = "Área de terreno";
      var area_text = document.createElement("p");
      area_text.classList.add("modal-wrapper_area_detail");
      area_text.classList.add("text-right");
      area_text.innerHTML = `${hotspot.area} m²`;
      wrapper_area.appendChild(area_title);
      wrapper_area.appendChild(area_text);

      var wrapper_perimetro_reservado = document.createElement("div");
      wrapper_perimetro_reservado.classList.add(
        "modal-wrapper_perimetro_reservado"
      );
      var perimetro_title = document.createElement("p");
      perimetro_title.innerHTML = "Perímetro";
      var perimetro_text = document.createElement("p");
      perimetro_text.classList.add("text-right");
      perimetro_text.innerHTML = `${perimetro} ml`;
      wrapper_perimetro_reservado.appendChild(perimetro_title);
      wrapper_perimetro_reservado.appendChild(perimetro_text);

      var wrapper_button = document.createElement("div");
      wrapper_button.classList.add("modal-wrapper_not_available");
      var not_available_text = document.createElement("p");
      not_available_text.innerHTML = "ESTE TERRENO NO ESTÁ DISPONIBLE";

      wrapper_button.appendChild(not_available_text);

      col1_reservado.appendChild(wraper_disponibilidad);
      col1_reservado.appendChild(wrapper_area);
      col1_reservado.appendChild(wrapper_perimetro_reservado);
      col1_reservado.appendChild(wrapper_button);

      modal_wraper_reservado.appendChild(col1_reservado);

      var header_wrapper = document.createElement("div");
      header_wrapper.classList.add("header-wrapper");
      var header_wrapper_icon = document.createElement("div");
      header_wrapper_icon.classList.add("header-wrapper_icon");
      var header_wrapper_icon_img = document.createElement("img");
      header_wrapper_icon_img.src = "img/icons/icon_close.svg";
      header_wrapper_icon.appendChild(header_wrapper_icon_img);

      header_wrapper.appendChild(header_wrapper_icon);

      modal.appendChild(header_top_reservado);
      modal.appendChild(modal_wraper_reservado);
      modal.appendChild(header_wrapper);

      modal.classList.add("modal_reservado");
        break;
    }

    // modal.innerHTML = wrapper.innerHTML;
    modal.classList.add("info-hotspot-modal");

    // modal.classList.add("modal");
    document.body.appendChild(modal);

    var openLink = function (lote, manzana) {
      let message = data.infoContacto.message;
      message = message.replace('{{lote}}', `${lote}`);
      message = message.replace('{{manzana}}', manzana);


      window.open(
        `https://wa.me/51${data.infoContacto.phoneNumber}?text=${message}`
      );
    };

    var toggle = function () {
      // let isActive = modal.classList.contains("visible");
      modal.classList.toggle("visible");
      // hotspot.isVisible = modal.classList.toggle("visible");

    };

    var showHideModal = function () {
      if (!hotspot.isVisible) {
        modal.classList.toggle("visible");
      }
    };

    // Show content when hotspot is clicked.

    wrapper
      // .querySelector(".info-hotspot-header")
      .querySelector(".info-hotspot-icon-wrapper")
      .addEventListener("click", toggle);

      // wrapper
      // .querySelector(".info-hotspot-icon-wrapper")
      // .addEventListener("mouseover", showHideModal);

      // wrapper
      // .querySelector(".info-hotspot-icon-wrapper")
      // .addEventListener("mouseout", showHideModal);

    // Hide content when close icon is clicked.

    modal
      .querySelector(".header-wrapper_icon")
      .addEventListener("click", () => {
        modal.classList.toggle("visible");
        // hotspot.isVisible = false;
      });

    button_link.addEventListener("click", () =>
      openLink(hotspot.lote, hotspot.manzana)
    );

    // Prevent touch and scroll events from reaching the parent element.
    // This prevents the view control logic from interfering with the hotspot.
    stopTouchAndScrollEventPropagation(wrapper);

    return wrapper;
  }

  // Prevent touch and scroll events from reaching the parent element.
  function stopTouchAndScrollEventPropagation(element, eventList) {
    var eventList = [ 'touchstart', 'touchmove', 'touchend', 'touchcancel',
                      'wheel', 'mousewheel' ];
    for (var i = 0; i < eventList.length; i++) {
      element.addEventListener(eventList[i], function(event) {
        event.stopPropagation();
      });
    }
  }

  function findSceneById(id) {
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].data.id === id) {
        return scenes[i];
      }
    }
    return null;
  }

  function findSceneDataById(id) {
    for (var i = 0; i < data.scenes.length; i++) {
      if (data.scenes[i].id === id) {
        return data.scenes[i];
      }
    }
    return null;
  }

  
  document.addEventListener("dragstart", function (evt) {
    if (evt.target.tagName == "IMG") {
      evt.preventDefault();
    }
  });
  
  // Display the initial scene.
  switchScene(scenes[0]);
}

loadData();
