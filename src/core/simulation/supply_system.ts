/**
 * 补给系统默认实现（spec feature-grand-war M2+M3）
 *
 * M3 新增：
 * - 陆路 BFS 补给不足且有港口的省份自动建立海运路线
 * - 海运路线消耗 transport 装备（convoy），若运输船不足则效率打折
 * - 海运补给经 pathSeaZoneIds 注入省份，受制海权影响
 */
import { Fixed } from '../determinism/fixed';
import { WorldState, SeaSupplyRoute } from '../state/world_state';
import { GameEvent } from './types';
import { SupplySystem, NavalSystem } from './interfaces';

const RECALC_INTERVAL = 60;
const SUPPLY_OK = Fixed.fromNumber(0.7);
const SUPPLY_LOW = Fixed.fromNumber(0.3);
const SUPPLY_CRITICAL = Fixed.fromNumber(0.1);
const DAILY_TICKS = 600;
const ORG_LOSS_CRITICAL_DAILY = Fixed.fromNumber(0.05);
const ORG_LOSS_NONE_DAILY = Fixed.fromNumber(0.15);
const STR_LOSS_NONE_DAILY = Fixed.fromNumber(0.05);
const SEA_ROUTE_SUPPLY_FLOW = Fixed.fromNumber(2);

export class DefaultSupplySystem implements SupplySystem {
  private navalSystem: NavalSystem | null = null;

  setNavalSystem(n: NavalSystem): void { this.navalSystem = n; }

  advanceTick(state: WorldState, dtMs: Fixed): GameEvent[] {
    const events: GameEvent[] = [];

    if (state.tickId - state.supplyNetwork.lastRecalcTick >= RECALC_INTERVAL || state.supplyNetwork.lastRecalcTick === 0) {
      this.recalc(state);
    }

    this.applySeaSupply(state, events);

    const dtRatio = dtMs.mul(Fixed.fromInt(10)).div(Fixed.fromInt(1000));

    state.countries.forEach((country) => {
      let letOutOfSupply = 0;

      state.divisions.forEach((div) => {
        if (div.ownerId !== country.id) return;
        const provSupply = state.supplyNetwork.provinceSupply.get(div.currentProvinceId);
        const targetLevel = provSupply ? provSupply.level : Fixed.ZERO;

        const supplyDelta = targetLevel.sub(div.supply).mul(Fixed.fromNumber(0.1)).mul(dtRatio);
        div.supply = div.supply.add(supplyDelta);
        if (div.supply.lessThan(Fixed.ZERO)) div.supply = Fixed.ZERO;
        if (div.supply.greaterThan(Fixed.ONE)) div.supply = Fixed.ONE;

        if (div.supply.greaterOrEqual(SUPPLY_OK)) div.supplyStatus = 'ok';
        else if (div.supply.greaterOrEqual(SUPPLY_LOW)) div.supplyStatus = 'low';
        else if (div.supply.greaterOrEqual(SUPPLY_CRITICAL)) {
          div.supplyStatus = 'critical';
          letOutOfSupply++;
        } else {
          div.supplyStatus = 'none';
          letOutOfSupply++;
        }

        if (div.status === 'training') return;

        if (div.supply.lessThan(SUPPLY_CRITICAL)) {
          const orgLoss = ORG_LOSS_NONE_DAILY.div(Fixed.fromInt(DAILY_TICKS)).mul(dtMs).div(Fixed.fromInt(100));
          div.organization = div.organization.sub(orgLoss);
          const strLoss = STR_LOSS_NONE_DAILY.div(Fixed.fromInt(DAILY_TICKS)).mul(dtMs).div(Fixed.fromInt(100));
          div.strength = div.strength.sub(strLoss);
          if (div.status === 'fighting' || div.status === 'moving' || div.status === 'ready') {
            div.inOffensive = false;
            div.targetProvinceId = null;
          }
        } else if (div.supply.lessThan(SUPPLY_LOW)) {
          const orgLoss = ORG_LOSS_CRITICAL_DAILY.div(Fixed.fromInt(DAILY_TICKS)).mul(dtMs).div(Fixed.fromInt(100));
          div.organization = div.organization.sub(orgLoss);
        }

        if (div.organization.lessThan(Fixed.ZERO)) div.organization = Fixed.ZERO;
        if (div.strength.lessThan(Fixed.ZERO)) div.strength = Fixed.ZERO;
      });

      if (letOutOfSupply >= 3 && state.tickId % 300 === 0) {
        events.push({
          kind: 'supplyCrisis',
          countryId: country.id,
          divisionsOutOfSupply: letOutOfSupply,
        });
      }
    });

    return events;
  }

  recalc(state: WorldState): void {
    const net = state.supplyNetwork;
    net.lastRecalcTick = state.tickId;
    net.provinceSupply = new (net.provinceSupply.constructor as any)();
    net.seaSupplyRoutes = [];

    state.countries.forEach((country) => {
      this.recalcForCountry(state, country.id);
    });
  }

  private recalcForCountry(state: WorldState, countryId: string): void {
    const country = state.countries.get(countryId);
    if (!country) return;
    const capitalId = country.capitalProvinceId;
    const capitalProv = state.provinces.get(capitalId);
    if (!capitalProv || capitalProv.controllerId !== countryId) return;

    let civilianFactoryCount = 0;
    state.factories.forEach((f) => {
      const prov = state.provinces.get(f.provinceId);
      if (prov && prov.controllerId === countryId && f.type === 'civilian') civilianFactoryCount++;
    });

    const sourceSupply = Fixed.fromNumber(3 + civilianFactoryCount * 0.5);

    const queue: { provId: number; supplyIn: Fixed }[] = [];
    const visited = new Set<number>();
    const demandMap = new Map<number, Fixed>();
    state.divisions.forEach((div) => {
      if (div.ownerId === countryId && div.status !== 'training') {
        const cur = demandMap.get(div.currentProvinceId) || Fixed.ZERO;
        demandMap.set(div.currentProvinceId, cur.add(Fixed.fromNumber(0.6)));
      }
    });

    queue.push({ provId: capitalId, supplyIn: sourceSupply });
    visited.add(capitalId);

    while (queue.length > 0) {
      const node = queue.shift()!;
      const prov = state.provinces.get(node.provId);
      if (!prov) continue;

      const demand = demandMap.get(node.provId) || Fixed.ZERO;
      let received = node.supplyIn;
      if (received.greaterThan(demand)) received = demand;
      const level = demand.greaterThan(Fixed.ZERO)
        ? received.div(demand)
        : node.supplyIn.greaterThan(Fixed.ZERO) ? Fixed.ONE : Fixed.ZERO;
      const clampedLevel = level.greaterThan(Fixed.ONE) ? Fixed.ONE : level;

      const existing = state.supplyNetwork.provinceSupply.get(node.provId);
      if (existing) {
        existing.level = clampedLevel; existing.demand = demand; existing.received = received; existing.viaPort = false;
      } else {
        state.supplyNetwork.provinceSupply.set(node.provId, {
          provinceId: node.provId, level: clampedLevel, demand, received, viaPort: false, bombedUntilTick: 0,
        });
      }

      let remaining = node.supplyIn.sub(demand);
      if (remaining.lessThan(Fixed.ZERO)) remaining = Fixed.ZERO;
      if (remaining.lessOrEqual(Fixed.fromNumber(0.01))) continue;

      const transferRate = prov.supplyHubLevel > 0
        ? Fixed.ONE
        : Fixed.fromNumber(0.5).add(Fixed.fromNumber(0.05).mul(Fixed.fromInt(prov.infrastructure)));
      const toForward = remaining.mul(transferRate);

      const friendlyNeighbors: number[] = [];
      for (const nid of prov.adjacentProvinceIds) {
        const np = state.provinces.get(nid);
        if (np && np.controllerId === countryId && !visited.has(nid)) friendlyNeighbors.push(nid);
      }
      if (friendlyNeighbors.length === 0) continue;
      const perNeighbor = toForward.div(Fixed.fromInt(friendlyNeighbors.length));
      for (const nid of friendlyNeighbors) {
        visited.add(nid);
        queue.push({ provId: nid, supplyIn: perNeighbor });
      }
    }

    this.ensureSeaRoutesForUndersuppliedPorts(state, countryId, demandMap);
  }

  private ensureSeaRoutesForUndersuppliedPorts(
    state: WorldState, countryId: string, demandMap: Map<number, Fixed>,
  ): void {
    const country = state.countries.get(countryId);
    if (!country) return;
    const capitalProv = state.provinces.get(country.capitalProvinceId);
    if (!capitalProv) return;

    let capitalPortId = country.capitalProvinceId;
    if (capitalProv.portLevel < 1) {
      state.provinces.forEach((p) => {
        if (p.controllerId === countryId && p.portLevel >= 1) capitalPortId = p.id;
      });
    }
    const capitalPort = state.provinces.get(capitalPortId);
    if (!capitalPort || capitalPort.portLevel < 1) return;

    state.provinces.forEach((p) => {
      if (p.controllerId !== countryId) return;
      if (p.portLevel < 1) return;
      if (p.id === capitalPortId) return;

      const curSupp = state.supplyNetwork.provinceSupply.get(p.id);
      const demand = demandMap.get(p.id) || Fixed.ZERO;
      const landRatio = curSupp ? curSupp.level : Fixed.ZERO;
      if (landRatio.greaterOrEqual(Fixed.fromNumber(0.5))) return;
      if (demand.lessOrEqual(Fixed.fromNumber(0.1))) return;

      const routeId = `sr_${countryId}_${capitalPortId}_${p.id}`;
      const existing = state.supplyNetwork.seaSupplyRoutes.find(r => r.id === routeId);
      let pathSeaZoneIds: number[] = [];
      for (const zid of p.adjacentSeaZoneIds) {
        if (capitalPort.adjacentSeaZoneIds.includes(zid)) {
          pathSeaZoneIds = [zid];
          break;
        }
      }
      if (pathSeaZoneIds.length === 0 && p.adjacentSeaZoneIds.length > 0) {
        pathSeaZoneIds = [p.adjacentSeaZoneIds[0]];
      }

      let convoysNeeded = Math.max(2, p.portLevel * 5);
      let convoysAssigned = convoysNeeded;
      let efficiency = Fixed.ONE;

      if (this.navalSystem) {
        const have = this.navalSystem.getConvoyCount(state, countryId);
        if (have < convoysNeeded) {
          convoysAssigned = have;
          efficiency = Fixed.fromInt(have).div(Fixed.fromInt(convoysNeeded));
        }
        if (convoysAssigned > 0) {
          this.navalSystem.consumeConvoys(state, countryId, 0);
        }

        let worstControl = Fixed.ONE;
        for (const zid of pathSeaZoneIds) {
          const ctrl = this.navalSystem.getSeaControl(state, zid, countryId);
          if (ctrl.lessThan(worstControl)) worstControl = ctrl;
        }
        if (worstControl.lessThan(Fixed.fromNumber(0.3))) {
          efficiency = efficiency.mul(Fixed.fromNumber(0.3));
        } else if (worstControl.lessThan(Fixed.fromNumber(0.6))) {
          efficiency = efficiency.mul(Fixed.fromNumber(0.6));
        }
      }

      const route: SeaSupplyRoute = existing ?? {
        id: routeId, ownerId: countryId,
        fromPortId: capitalPortId, toPortId: p.id,
        pathSeaZoneIds: [], convoysAssigned: 0, efficiency: Fixed.ONE, escortFleetIds: [],
      };
      route.pathSeaZoneIds = pathSeaZoneIds;
      route.convoysAssigned = convoysAssigned;
      route.efficiency = efficiency;
      if (!existing) state.supplyNetwork.seaSupplyRoutes.push(route);
    });
  }

  private applySeaSupply(state: WorldState, _events: GameEvent[]): void {
    for (const route of state.supplyNetwork.seaSupplyRoutes) {
      if (route.convoysAssigned <= 0) continue;
      const toProv = state.supplyNetwork.provinceSupply.get(route.toPortId);
      if (!toProv) continue;
      const seaFlow = SEA_ROUTE_SUPPLY_FLOW.mul(route.efficiency);
      toProv.received = toProv.received.add(seaFlow);
      const newLevel = toProv.demand.greaterThan(Fixed.ZERO)
        ? toProv.received.div(toProv.demand).min(Fixed.ONE)
        : Fixed.ONE;
      if (newLevel.greaterThan(toProv.level)) toProv.level = newLevel;
      toProv.viaPort = true;
    }
  }

  getDivisionSupplyModifier(state: WorldState, divisionId: number): Fixed {
    const div = state.divisions.get(divisionId);
    if (!div) return Fixed.ONE;
    if (div.supply.greaterOrEqual(SUPPLY_OK)) return Fixed.ONE;
    if (div.supply.greaterOrEqual(SUPPLY_LOW)) return Fixed.fromNumber(0.8);
    if (div.supply.greaterOrEqual(SUPPLY_CRITICAL)) return Fixed.fromNumber(0.5);
    return Fixed.fromNumber(0.3);
  }

  canInitiateOffensive(state: WorldState, divisionId: number): boolean {
    const div = state.divisions.get(divisionId);
    if (!div) return false;
    return div.supply.greaterOrEqual(SUPPLY_LOW);
  }

  ensureSeaRoute(state: WorldState, countryId: string, toPortId: number): SeaSupplyRoute | null {
    const toProv = state.provinces.get(toPortId);
    if (!toProv || toProv.controllerId !== countryId || toProv.portLevel < 1) return null;
    const country = state.countries.get(countryId);
    if (!country) return null;
    const capitalProv = state.provinces.get(country.capitalProvinceId);
    if (!capitalProv) return null;

    let fromPortId = country.capitalProvinceId;
    if (capitalProv.portLevel < 1) {
      state.provinces.forEach((p) => {
        if (p.controllerId === countryId && p.portLevel >= 1) fromPortId = p.id;
      });
    }
    const fromProv = state.provinces.get(fromPortId);
    if (!fromProv || fromProv.portLevel < 1) return null;

    const routeId = `sr_${countryId}_${fromPortId}_${toPortId}`;
    const existing = state.supplyNetwork.seaSupplyRoutes.find(r => r.id === routeId);
    if (existing) return existing;

    let pathSeaZoneIds: number[] = [];
    for (const zid of toProv.adjacentSeaZoneIds) {
      if (fromProv.adjacentSeaZoneIds.includes(zid)) { pathSeaZoneIds = [zid]; break; }
    }
    if (pathSeaZoneIds.length === 0 && toProv.adjacentSeaZoneIds.length > 0) {
      pathSeaZoneIds = [toProv.adjacentSeaZoneIds[0]];
    }
    const route: SeaSupplyRoute = {
      id: routeId, ownerId: countryId, fromPortId, toPortId,
      pathSeaZoneIds, convoysAssigned: toProv.portLevel * 5,
      efficiency: Fixed.ONE, escortFleetIds: [],
    };
    state.supplyNetwork.seaSupplyRoutes.push(route);
    return route;
  }
}
