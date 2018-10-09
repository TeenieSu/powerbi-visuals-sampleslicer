/*
 *  Power BI Visualizations
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved.
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

module powerbi.extensibility.visual {
    // d3
    import Selection = d3.Selection;

    // powerbi.extensibility.utils.interactivity
    import ISelectionHandler = powerbi.extensibility.utils.interactivity.ISelectionHandler;
    import SelectableDataPoint = powerbi.extensibility.utils.interactivity.SelectableDataPoint;
    import IInteractiveBehavior = powerbi.extensibility.utils.interactivity.IInteractiveBehavior;
    import IInteractivityService = powerbi.extensibility.utils.interactivity.IInteractivityService;

    export interface SampleSlicerBehaviorOptions {
        slicerItemContainers: Selection<SelectableDataPoint>;
        dataPoints: SampleSlicerDataPoint[];
        interactivityService: IInteractivityService;
        slicerSettings: Settings;
        isSelectionLoaded: boolean;
        sliderCallback: Function;
        inputBoxUpdateCallback: Function;
    }

    export class SelectionBehavior implements IInteractiveBehavior {
        /* discrete selection model*/
        private selectionHandler: ISelectionHandler;
        /* range selection model*/
        public scalableRange: ScalableRange;

        private slicers: Selection<SelectableDataPoint>;
        private interactivityService: IInteractivityService;
        private slicerSettings: Settings;
        private options: SampleSlicerBehaviorOptions;
        private dataPoints: SampleSlicerDataPoint[];
        private callbacks: SampleSlicerCallbacks;
        private lastWeekSeleted: boolean = false;
        private lastMonthSeleted: boolean = false;
        private minDate: Date;
        private maxDate: Date;

        constructor(callbacks: SampleSlicerCallbacks) {
            this.scalableRange = new ScalableRange();
            this.callbacks = callbacks;
        }


        /**
            Implementation of IInteractiveBehavior i/f
        */
        public bindEvents(options: SampleSlicerBehaviorOptions, selectionHandler: ISelectionHandler): void {
            const slicers: Selection<SelectableDataPoint> = this.slicers = options.slicerItemContainers;

            this.dataPoints = options.dataPoints;
            this.interactivityService = options.interactivityService;
            this.slicerSettings = options.slicerSettings;
            this.options = options;

            this.selectionHandler = selectionHandler;
            this.minDate = _.minBy(this.dataPoints, p => p.value).value;
            this.maxDate = _.maxBy(this.dataPoints, p => p.value).value;

            slicers.on("click", (dataPoint: SampleSlicerDataPoint, index: number) => {
                (d3.event as MouseEvent).preventDefault();

                let startDate: Date;
                const endDate: Date = new Date();
                let selectedDataPoints: SampleSlicerDataPoint[] = [];
                if(index == 0) {
                    // Assume 0 as "Last Week"
                    selectionHandler.handleClearSelection();
                    if(this.lastWeekSeleted) {
                        this.options.sliderCallback([this.minDate.getTime(), endDate.getTime()]);
                    } else {
                        startDate = new Date();
                        startDate.setDate(endDate.getDate()-7);
                        selectedDataPoints = this.dataPoints.filter(d => d.value>=startDate && d.value<=endDate);
                        this.options.sliderCallback([startDate.getTime(), endDate.getTime()]);
                    }
                    this.lastWeekSeleted = !this.lastWeekSeleted;
                    this.lastMonthSeleted = false;
                } else if(index == 1) {
                    selectionHandler.handleClearSelection();
                    if(this.lastMonthSeleted) {
                        this.options.sliderCallback([this.minDate.getTime(), this.maxDate.getTime()]);
                    } else {
                        startDate = new Date();
                        startDate.setDate(endDate.getDate()-30);
                        selectedDataPoints = this.dataPoints.filter(d => d.value>=startDate && d.value<=endDate);
                        this.options.sliderCallback([startDate.getTime(), this.maxDate.getTime()]);
                    }
                    this.lastMonthSeleted = !this.lastMonthSeleted;
                    this.lastWeekSeleted = false;
                }

                this.options.inputBoxUpdateCallback();

                /* update selection state */
                selectedDataPoints.forEach( d => {
                    d.filtered = true;
                    d.selected = true;
                    d.isSelectedRangePoint = true;
                    selectionHandler.handleSelection(d, true);
                });

                /* send selection state to the host*/
                selectionHandler.applySelectionFilter();
            });

        }

        /**
            Implementation of IInteractiveBehavior i/f
        */
        public renderSelection(hasSelection: boolean): void {
            if (!hasSelection && !this.interactivityService.isSelectionModeInverted()) {
                this.slicers.style(
                    "background",
                    this.slicerSettings.slicerText.unselectedColor);
            }
            else {
                this.styleSlicerInputs(this.slicers, hasSelection);
            }
        }

        public clearAllDiscreteSelections() {
            /* update state to clear all selections */
            if (this.selectionHandler) {
                this.selectionHandler.handleClearSelection();
            }
        }

        public clearRangeSelection(): void {
            this.scalableRange = new ScalableRange();
        }

        public styleSlicerInputs(slicers: Selection<any>, hasSelection: boolean) {
            let settings = this.slicerSettings;
            slicers.each(function (dataPoint: SampleSlicerDataPoint) {
                d3.select(this).style({
                    "background": (dataPoint.selected || dataPoint.isSelectedRangePoint)
                        ? settings.slicerText.selectedColor
                        : settings.slicerText.unselectedColor
                });
            });
        }

        public updateOnRangeSelectonChange(): void {
            this.clearAllDiscreteSelections();

            let value: ValueRange<number> = this.scalableRange.getValue();
            if (!value.min && !value.max) {
                return;
            }

            let conditions: IAdvancedFilterCondition[] = [];
            let target: IFilterColumnTarget = this.callbacks.getAdvancedFilterColumnTarget();

            if (value.min) {
                conditions.push({
                    operator: "GreaterThan",
                    value: new Date(value.min).toJSON()
                });
            }

            if (value.max) {
                conditions.push({
                    operator: "LessThan",
                    value: new Date(value.max).toJSON()
                });
            }

            const sliderRange: any = this.scalableRange.getScalingTransformationDomain();
            
            let filter: IAdvancedFilter = new window['powerbi-models'].AdvancedFilter(target, "And", conditions);
            this.callbacks.applyAdvancedFilter(filter);
        }
    }
}
