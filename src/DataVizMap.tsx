import React from 'react';
import {Map as MLMap} from '@vis.gl/react-maplibre';
import mapStyleRaw from './assets/map_style.json?raw';
import type {StyleSpecification} from 'maplibre-gl';

const MAP_STYLE = JSON.parse(mapStyleRaw) as StyleSpecification;

export default function DataVizMap(): React.ReactElement {
    return (
        <div className="altmap-root">
            <MLMap
                mapStyle={MAP_STYLE}
                initialViewState={{
                    longitude: 10,
                    latitude: 50,
                    zoom: 3.5
                }}
                style={{ width: '100%', height: '100%' }}
            />
        </div>
    );
}
