# Hackali Kasa

Küçük bir alış-satış defteri. Ürünü kimden kaça aldığını, kime kaça taktığını, kârı ve kasada kalan parayı tutar. Eleman yemeği ya da gider olacak bir alış da kasadan düşer.

Kayıtlar tarayıcıda kalır. Yedek için **Dışa aktar** ile JSON indir.

```bash
python3 -m http.server 4173
```

Sonra `http://localhost:4173` adresini aç.

Hesapların kontrolü:

```bash
npm test
```
