export const radioLayout = [
  {
    id: 'year-navigation',
    component: 'YearSelector',
    slot: 'timeline',
    order: 10,
    label: 'Year Navigation',
    enabled: true,
    responsive: {
      mobile: 'full-width',
      desktop: 'full-width'
    }
  },
  {
    id: 'item-navigation',
    component: 'ItemNavigator',
    slot: 'controls',
    order: 20,
    label: 'Recording Selection',
    enabled: true,
    responsive: {
      mobile: 'full-width',
      desktop: 'stretch'
    }
  },
  {
    id: 'power',
    component: 'Button',
    slot: 'controls',
    order: 30,
    label: 'Power',
    enabled: true,
    responsive: {
      mobile: 'compact',
      desktop: 'compact'
    }
  },
  {
    id: 'tuning-knob',
    component: 'TuningKnob',
    slot: 'controls',
    order: 40,
    label: 'Tuning',
    enabled: true,
    responsive: {
      mobile: 'compact',
      desktop: 'compact'
    }
  },
  {
    id: 'volume-knob',
    component: 'VolumeKnob',
    slot: 'controls',
    order: 50,
    label: 'Volume',
    enabled: true,
    responsive: {
      mobile: 'compact',
      desktop: 'compact'
    }
  }
];
