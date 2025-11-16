export interface StrippedPeripheral {
    id: string;
    name: string | null;
    rssi: number | null;
    connected?: boolean;
    connecting?: boolean;
    localName?: string;
    serviceUUIDs?: string[];
    retrievedServices?: boolean;
}

export interface PeripheralServices {
    peripheralId: string;
    serviceId: string;
    transfer: string;
    receive: string;
    allServices?: string[];
}