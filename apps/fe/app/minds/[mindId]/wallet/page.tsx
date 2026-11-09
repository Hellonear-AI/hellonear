import { WalletScreen } from "@/modules/wallet/components/WalletScreen"

export const metadata = { title: "Wallet" }

export default async function Page({ params }: { params: Promise<{ mindId: string }> }) {
  const { mindId } = await params
  return <WalletScreen mindId={mindId} />
}
