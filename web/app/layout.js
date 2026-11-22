import "./globals.css";
import Nav from "@/components/Nav";

export const metadata = {
  title: "Credential Passport",
  description: "Blockchain-based digital credentials with DID and QR verification",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main className="container">{children}</main>
        <footer className="footer container">Digital Credential Passport · DID + Verifiable Credentials + Ethereum · testnet prototype</footer>
      </body>
    </html>
  );
}
