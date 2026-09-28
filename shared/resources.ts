import type {Wallet} from './contracts.js'
export const resourceKeys=['food','wood','stone','iron','gold','coupon'] as const
export const emptyResources=():Wallet=>({food:0,wood:0,stone:0,iron:0,gold:0,coupon:0})
export const MAX_RESOURCE_GRANT=1000000000
export const MAX_RESOURCE_BALANCE=9000000000000
export interface ResourceGrantResult {clientActionId:string;amounts:Wallet;wallet:Wallet;appliedAt:string}
export interface ResourceAdminState {wallet:Wallet;recent:ResourceGrantResult[]}
