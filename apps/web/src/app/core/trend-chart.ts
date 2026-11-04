import type { ElementRef } from '@angular/core';
import {
  afterNextRender,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { type EChartsType, init, use } from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';

use([LineChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);
@Component({
  selector: 'app-trend-chart',
  styles: [':host { display: block; min-width: 0; overflow: hidden; }'],
  template:
    '<div #chart role="img" aria-label="Daily final and first-attempt pass rates. Exact values and day filters are in the table below." style="height:260px;width:100%"></div>',
})
export class TrendChart {
  public readonly points = input.required<
    {
      day: string;
      finalPassRate: number | null;
      firstAttemptPassRate: number | null;
      executed: number;
    }[]
  >();
  public readonly daySelected = output<string>();
  private readonly element = viewChild<ElementRef<HTMLDivElement>>('chart');
  private chart?: EChartsType;
  public constructor() {
    const destroy = inject(DestroyRef);
    effect(() => {
      this.points();
      this.draw();
    });
    afterNextRender(() => {
      const node = this.element()?.nativeElement;
      if (!node) {
        return;
      }
      this.chart = init(node, undefined, { renderer: 'svg' });
      this.chart.on('click', (event) => {
        if (typeof event.name === 'string') {
          this.daySelected.emit(event.name);
        }
      });
      const resize = new ResizeObserver(() => this.chart?.resize());
      resize.observe(node);
      const theme = new MutationObserver(() => this.draw());
      theme.observe(document.documentElement, { attributes: true });
      this.draw();
      destroy.onDestroy(() => {
        resize.disconnect();
        theme.disconnect();
        this.chart?.dispose();
      });
    });
  }
  private draw(): void {
    const styles = getComputedStyle(document.documentElement);
    const color = styles.getPropertyValue('--text').trim() || '#64748b';
    const surface = styles.getPropertyValue('--surface').trim();
    const border = styles.getPropertyValue('--border').trim();
    const primary = styles.getPropertyValue('--chart-primary').trim();
    const comparison = styles.getPropertyValue('--chart-comparison').trim();
    this.chart?.setOption({
      animation: false,
      grid: { left: 48, right: 20, top: 48, bottom: 35 },
      legend: {
        selectedMode: false,
        top: 0,
        left: 0,
        itemWidth: 18,
        itemHeight: 8,
        textStyle: { color, fontSize: 12 },
      },
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: surface,
        borderColor: border,
        textStyle: { color },
        valueFormatter: (value: number | string) => `${value}%`,
      },
      xAxis: {
        type: 'category',
        data: this.points().map((point) => point.day),
        axisLabel: { color },
        axisLine: { lineStyle: { color } },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        axisLabel: { formatter: '{value}%', color },
        splitLine: { lineStyle: { color: border } },
      },
      series: [
        {
          type: 'line',
          name: 'Final pass rate',
          data: this.points().map((point) =>
            point.finalPassRate === null ? null : Math.round(point.finalPassRate * 1000) / 10,
          ),
          connectNulls: false,
          symbolSize: 8,
          lineStyle: { color: primary, width: 3 },
          itemStyle: { color: primary },
        },
        {
          type: 'line',
          name: 'First-attempt pass rate',
          data: this.points().map((point) =>
            point.firstAttemptPassRate === null
              ? null
              : Math.round(point.firstAttemptPassRate * 1000) / 10,
          ),
          connectNulls: false,
          symbol: 'diamond',
          symbolSize: 8,
          lineStyle: { color: comparison, width: 2, type: 'dashed' },
          itemStyle: { color: comparison },
        },
      ],
    });
  }
}
