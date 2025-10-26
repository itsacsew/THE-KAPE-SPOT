import { Feather } from "@expo/vector-icons";

export const icons = {
    POS: (props: any) => <Feather name="shopping-cart" size={20} {...props} />,
    Items: (props: any) => <Feather name="package" size={20} {...props} />,
    People: (props: any) => <Feather name="users" size={20} {...props} />,
    Sales: (props: any) => <Feather name="dollar-sign" size={20} {...props} />,
    Settings: (props: any) => <Feather name="settings" size={20} {...props} />,
    OrderStatus: (props: any) => <Feather name="clipboard" size={20} {...props} />,
};
