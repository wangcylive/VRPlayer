!(function(factory) {
    if("function" === typeof define && define.amd) {
        define("three-extend", ["three"], factory)
    } else if("object" === typeof exports) {
        module.exports = factory;
    } else {
        factory();
    }
}(function() {
    /**
     * @author alteredq / http://alteredqualia.com/
     * @authod mrdoob / http://mrdoob.com/
     * @authod arodic / http://aleksandarrodic.com/
     * @authod fonserbc / http://fonserbc.github.io/
     */

    THREE.StereoEffect = function ( renderer ) {

        var _stereo = new THREE.StereoCamera();
        _stereo.aspect = 0.5;

        this.setSize = function ( width, height ) {

            renderer.setSize( width, height );

        };

        this.render = function ( scene, camera ) {

            scene.updateMatrixWorld();

            if ( camera.parent === null ) camera.updateMatrixWorld();

            _stereo.update( camera );

            var size = renderer.getSize();

            renderer.setScissorTest( true );
            renderer.clear();

            renderer.setScissor( 0, 0, size.width / 2, size.height );
            renderer.setViewport( 0, 0, size.width / 2, size.height );
            renderer.render( scene, _stereo.cameraL );

            renderer.setScissor( size.width / 2, 0, size.width / 2, size.height );
            renderer.setViewport( size.width / 2, 0, size.width / 2, size.height );
            renderer.render( scene, _stereo.cameraR );

            renderer.setScissorTest( false );

        };

    };

    /**
     * @author richt / http://richt.me
     * @author WestLangley / http://github.com/WestLangley
     *
     * W3C Device Orientation control (http://w3c.github.io/deviceorientation/spec-source-orientation.html)
     */

    THREE.DeviceOrientationControls = function( object ) {

        var scope = this;

        this.object = object;
        this.object.rotation.reorder( "YXZ" );

        this.enabled = true;

        this.deviceOrientation = {};
        this.screenOrientation = 0;

        this.alpha = 0;
        this.alphaOffsetAngle = 0;


        var onDeviceOrientationChangeEvent = function( event ) {

            scope.deviceOrientation = event;

        };

        var onScreenOrientationChangeEvent = function() {

            scope.screenOrientation = window.orientation || 0;

        };

        // The angles alpha, beta and gamma form a set of intrinsic Tait-Bryan angles of type Z-X'-Y''

        var setObjectQuaternion = function() {

            var zee = new THREE.Vector3( 0, 0, 1 );

            var euler = new THREE.Euler();

            var q0 = new THREE.Quaternion();

            var q1 = new THREE.Quaternion( - Math.sqrt( 0.5 ), 0, 0, Math.sqrt( 0.5 ) ); // - PI/2 around the x-axis

            return function( quaternion, alpha, beta, gamma, orient ) {

                euler.set( beta, alpha, - gamma, 'YXZ' ); // 'ZXY' for the device, but 'YXZ' for us

                quaternion.setFromEuler( euler ); // orient the device

                quaternion.multiply( q1 ); // camera looks out the back of the device, not the top

                quaternion.multiply( q0.setFromAxisAngle( zee, - orient ) ); // adjust for screen orientation

            }

        }();

        this.connect = function() {

            onScreenOrientationChangeEvent(); // run once on load

            window.addEventListener( 'orientationchange', onScreenOrientationChangeEvent, false );
            window.addEventListener( 'deviceorientation', onDeviceOrientationChangeEvent, false );

            scope.enabled = true;

        };

        this.disconnect = function() {

            window.removeEventListener( 'orientationchange', onScreenOrientationChangeEvent, false );
            window.removeEventListener( 'deviceorientation', onDeviceOrientationChangeEvent, false );

            scope.enabled = false;

        };

        this.update = function() {

            if ( scope.enabled === false ) return;

            var alpha = scope.deviceOrientation.alpha ? THREE.Math.degToRad( scope.deviceOrientation.alpha ) + this.alphaOffsetAngle : 0; // Z
            var beta = scope.deviceOrientation.beta ? THREE.Math.degToRad( scope.deviceOrientation.beta ) : 0; // X'
            var gamma = scope.deviceOrientation.gamma ? THREE.Math.degToRad( scope.deviceOrientation.gamma ) : 0; // Y''
            var orient = scope.screenOrientation ? THREE.Math.degToRad( scope.screenOrientation ) : 0; // O

            setObjectQuaternion( scope.object.quaternion, alpha, beta, gamma, orient );
            this.alpha = alpha;

        };

        this.updateAlphaOffsetAngle = function( angle ) {

            this.alphaOffsetAngle = angle;
            this.update();

        };

        this.dispose = function() {

            this.disconnect();

        };

        //this.connect();

    };


    /**
     * @author mrdoob / http://mrdoob.com/
     */

    window.Stats = function () {

        var mode = 0;

        var container = document.createElement( 'div' );
        container.style.cssText = 'position:fixed;top:0;left:0;cursor:pointer;opacity:0.9;z-index:10000';
        container.addEventListener( 'click', function ( event ) {

            event.preventDefault();
            showPanel( ++ mode % container.children.length );

        }, false );

        //

        function addPanel( panel ) {

            container.appendChild( panel.dom );
            return panel;

        }

        function showPanel( id ) {

            for ( var i = 0; i < container.children.length; i ++ ) {

                container.children[ i ].style.display = i === id ? 'block' : 'none';

            }

            mode = id;

        }

        //

        var beginTime = ( performance || Date ).now(), prevTime = beginTime, frames = 0;

        var fpsPanel = addPanel( new Stats.Panel( 'FPS', '#0ff', '#002' ) );
        var msPanel = addPanel( new Stats.Panel( 'MS', '#0f0', '#020' ) );

        if ( self.performance && self.performance.memory ) {

            var memPanel = addPanel( new Stats.Panel( 'MB', '#f08', '#201' ) );

        }

        showPanel( 0 );

        return {

            REVISION: 16,

            dom: container,

            addPanel: addPanel,
            showPanel: showPanel,

            begin: function () {

                beginTime = ( performance || Date ).now();

            },

            end: function () {

                frames ++;

                var time = ( performance || Date ).now();

                msPanel.update( time - beginTime, 200 );

                if ( time > prevTime + 1000 ) {

                    fpsPanel.update( ( frames * 1000 ) / ( time - prevTime ), 100 );

                    prevTime = time;
                    frames = 0;

                    if ( memPanel ) {

                        var memory = performance.memory;
                        memPanel.update( memory.usedJSHeapSize / 1048576, memory.jsHeapSizeLimit / 1048576 );

                    }

                }

                return time;

            },

            update: function () {

                beginTime = this.end();

            },

            // Backwards Compatibility

            domElement: container,
            setMode: showPanel

        };

    };

    Stats.Panel = function ( name, fg, bg ) {

        var min = Infinity, max = 0, round = Math.round;
        var PR = round( window.devicePixelRatio || 1 );

        var WIDTH = 80 * PR, HEIGHT = 48 * PR,
            TEXT_X = 3 * PR, TEXT_Y = 2 * PR,
            GRAPH_X = 3 * PR, GRAPH_Y = 15 * PR,
            GRAPH_WIDTH = 74 * PR, GRAPH_HEIGHT = 30 * PR;

        var canvas = document.createElement( 'canvas' );
        canvas.width = WIDTH;
        canvas.height = HEIGHT;
        canvas.style.cssText = 'width:80px;height:48px';

        var context = canvas.getContext( '2d' );
        context.font = 'bold ' + ( 9 * PR ) + 'px Helvetica,Arial,sans-serif';
        context.textBaseline = 'top';

        context.fillStyle = bg;
        context.fillRect( 0, 0, WIDTH, HEIGHT );

        context.fillStyle = fg;
        context.fillText( name, TEXT_X, TEXT_Y );
        context.fillRect( GRAPH_X, GRAPH_Y, GRAPH_WIDTH, GRAPH_HEIGHT );

        context.fillStyle = bg;
        context.globalAlpha = 0.9;
        context.fillRect( GRAPH_X, GRAPH_Y, GRAPH_WIDTH, GRAPH_HEIGHT );

        return {

            dom: canvas,

            update: function ( value, maxValue ) {

                min = Math.min( min, value );
                max = Math.max( max, value );

                context.fillStyle = bg;
                context.globalAlpha = 1;
                context.fillRect( 0, 0, WIDTH, GRAPH_Y );
                context.fillStyle = fg;
                context.fillText( round( value ) + ' ' + name + ' (' + round( min ) + '-' + round( max ) + ')', TEXT_X, TEXT_Y );

                context.drawImage( canvas, GRAPH_X + PR, GRAPH_Y, GRAPH_WIDTH - PR, GRAPH_HEIGHT, GRAPH_X, GRAPH_Y, GRAPH_WIDTH - PR, GRAPH_HEIGHT );

                context.fillRect( GRAPH_X + GRAPH_WIDTH - PR, GRAPH_Y, PR, GRAPH_HEIGHT );

                context.fillStyle = bg;
                context.globalAlpha = 0.9;
                context.fillRect( GRAPH_X + GRAPH_WIDTH - PR, GRAPH_Y, PR, round( ( 1 - ( value / maxValue ) ) * GRAPH_HEIGHT ) );

            }

        };

    };
}));
