import { BODY_LAYERS, type BodyLayerId } from '../../body/index.ts';
import { Pictogram, type PictogramName } from '../../components/pictograms';
import { layerAvailable } from './artwork/registry.ts';
import type { BodyExplorerActions, BodyExplorerState } from './useBodyExplorer.ts';

const LAYER_MARK: Record<BodyLayerId, PictogramName> = {
  hologram: 'body',
  systems: 'systems',
  structures: 'structure',
};

const LAYER_LABEL: Record<BodyLayerId, string> = {
  hologram: 'Hologram',
  systems: 'Systems',
  structures: 'Organs',
};

const LAYER_HINT: Record<BodyLayerId, string> = {
  hologram: 'Surface anatomy',
  systems: 'Body systems',
  structures: 'Internal structures',
};

export type StageControlsProps = BodyExplorerState &
  Pick<BodyExplorerActions, 'setVariant' | 'setView' | 'setLayer' | 'setZoom' | 'clearSelection'>;

/** Compact icon control, used for view and zoom actions. */
function IconControl({
  mark,
  label,
  pressed,
  disabled,
  onClick,
}: {
  mark: PictogramName;
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="icon-control"
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="icon-control__mark" aria-hidden="true">
        <Pictogram name={mark} size={20} />
      </span>
      <span className="icon-control__label type-caption">{label}</span>
    </button>
  );
}

export function ViewControls({
  selection,
  zoom,
  setView,
  setZoom,
  clearSelection,
  onEnterFace,
}: StageControlsProps & { onEnterFace?: () => void }) {
  const hasRegion = selection.selectedRegionId !== null;
  return (
    <section className="module module--controls" aria-label="View controls">
      <h2 className="module__title type-label">View controls</h2>

      <div className="icon-control__row" role="group" aria-label="Body view">
        <IconControl
          mark="location"
          label="Zoom"
          pressed={zoom === 'region'}
          disabled={!hasRegion}
          onClick={() => setZoom(zoom === 'region' ? 'whole-body' : 'region')}
        />
        <IconControl
          mark="body"
          label="Front"
          pressed={selection.view === 'front'}
          onClick={() => setView('front')}
        />
        <IconControl
          mark="body"
          label="Back"
          pressed={selection.view === 'back'}
          onClick={() => setView('back')}
        />
        <IconControl mark="back" label="Reset" onClick={clearSelection} />
      </div>
      {selection.view === 'back' && onEnterFace ? (
        <button className="ghost-button" type="button" onClick={onEnterFace}>View face from front</button>
      ) : null}
    </section>
  );
}

export function LayerSwitcher({ variantId, selection, setLayer, compact }: StageControlsProps & { compact?: boolean }) {
  return (
    <section className="module module--layers" data-compact={compact ? 'true' : undefined} aria-label="Body layer">
      <h2 className="module__title type-label">Layer</h2>
      <ul className="layer-list">
        {BODY_LAYERS.map((layer) => {
          const available = layerAvailable(variantId, selection.view, layer.id as BodyLayerId);
          const active = selection.layer === layer.id;
          return (
            <li key={layer.id}>
              <button
                className="layer-row"
                type="button"
                aria-pressed={active}
                disabled={!available}
                title={available ? layer.purpose : 'Approved artwork is not available yet.'}
                onClick={() => setLayer(layer.id as BodyLayerId)}
              >
                <span className="layer-row__mark" aria-hidden="true">
                  <Pictogram name={LAYER_MARK[layer.id as BodyLayerId]} size={20} state={active ? 'active' : 'default'} />
                </span>
                <span className="layer-row__text">
                  <span className="type-control">{LAYER_LABEL[layer.id as BodyLayerId]}</span>
                  <span className="type-caption layer-row__hint">{LAYER_HINT[layer.id as BodyLayerId]}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function StageControls(props: StageControlsProps) {
  return (
    <>
      <ViewControls {...props} />
      <LayerSwitcher {...props} />
    </>
  );
}
