FROM hashicorp/vault:latest

USER root

RUN mkdir -p /vault/data /vault/logs /opt/finapp/secrets

COPY vault.hcl /vault/config/vault.hcl
COPY policies /vault/config/policies
COPY entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["vault", "server", "-config=/vault/config/vault.hcl"]
