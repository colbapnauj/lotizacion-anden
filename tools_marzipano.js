pano.addEventListener("click", function (e) {
    var view = viewer.view();
    var loc = view.screenToCoordinates({ x: e.clientX, y: e.clientY });
    console.log(view.screenToCoordinates({ x: e.clientX, y: e.clientY }));
    console.log(`"yaw": ${loc.yaw}, "pitch": ${loc.pitch},`);
    var coord = `"yaw": ${loc.yaw}, "pitch": ${loc.pitch},`;
    navigator.clipboard.writeText(coord);

    var _fov = viewer._currentScene._view._fov;
    console.log(_fov);
});